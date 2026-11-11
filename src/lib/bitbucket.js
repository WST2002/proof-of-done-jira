// Reads the Bitbucket Cloud pull requests that mention a Jira key: merge state, changed files, diff, build statuses.
// Returns the same shape as github.js, so verdict.js judges both the same way.
import { mentions } from "./github.js";
import { detectAI } from "./ai.js";

const API = "https://api.bitbucket.org/2.0";
const MAX_PRS = 5;

// Bitbucket build states → the GitHub-style status/conclusion verdict.js understands.
const STATUS = {
  SUCCESSFUL: { status: "completed", conclusion: "success" },
  FAILED: { status: "completed", conclusion: "failure" },
  STOPPED: { status: "completed", conclusion: "cancelled" },
  INPROGRESS: { status: "in_progress", conclusion: null },
};

function client(fetch, token) {
  const headers = { Accept: "application/json", "User-Agent": "proof-of-done-jira" };
  // A token is "username:app-password" or "email:api-token" (Basic auth).
  if (token) headers.Authorization = `Basic ${btoa(token)}`;
  return async (url, asText = false) => {
    let res = await fetch(url.startsWith("http") ? url : `${API}${url}`, { headers });
    if (res.status === 401 && headers.Authorization) {
      delete headers.Authorization;
      res = await fetch(url.startsWith("http") ? url : `${API}${url}`, { headers });
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if (res.status === 429) throw new Error("Bitbucket's rate limit was reached. An admin can add a Bitbucket token in the Proof of Done settings.");
      if (res.status === 404) throw new Error(`Bitbucket repository not found or not readable: ${url.split("/").slice(2, 4).join("/")}. Check the repository, and add a token for a private one.`);
      throw new Error(`Bitbucket ${res.status} for ${url}: ${body}`);
    }
    return asText ? res.text() : res.json();
  };
}

async function all(get, url, max = 3) {
  const items = [];
  for (let next = url, page = 0; next && page < max; page++) {
    const data = await get(next);
    items.push(...(data.values ?? []));
    next = data.next;
  }
  return items;
}

/** Pull requests in `repo` ("workspace/name") whose title or source branch mentions `key`. */
export async function linkedBitbucketPullRequests({ fetch, token, repo, key }) {
  const get = client(fetch, token);
  const base = `/repositories/${repo}/pullrequests`;
  const recent = await all(get, `${base}?state=OPEN&state=MERGED&state=DECLINED&state=SUPERSEDED&sort=-updated_on&pagelen=50`, 2);
  const linked = recent.filter((p) => p.state !== "DECLINED" && p.state !== "SUPERSEDED" && (mentions(p.title, key) || mentions(p.source?.branch?.name, key)));
  const prs = [];
  for (const pr of linked.slice(0, MAX_PRS)) {
    const files = await all(get, `${base}/${pr.id}/diffstat?pagelen=100`);
    const diff = await get(`${base}/${pr.id}/diff`, true);
    const statuses = await all(get, `${base}/${pr.id}/statuses?pagelen=50`, 1);
    const commits = await all(get, `${base}/${pr.id}/commits?pagelen=50`, 1);
    prs.push({
      number: pr.id,
      url: pr.links?.html?.href ?? `https://bitbucket.org/${repo}/pull-requests/${pr.id}`,
      merged: pr.state === "MERGED",
      files: files.map((f) => f.new?.path ?? f.old?.path).filter(Boolean),
      diff,
      checks: statuses.map((s) => ({ name: s.name || s.key, ...(STATUS[s.state] ?? { status: "completed", conclusion: "neutral" }) })),
      ai: detectAI(commits.map((c) => ({ message: c.message, author: c.author?.user?.nickname ?? c.author?.raw }))),
    });
  }
  return prs;
}
