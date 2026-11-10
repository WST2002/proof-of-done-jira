// Reads the pull requests that mention a Jira key from GitHub: merged state, changed files, diff, check runs.
// `fetch` is passed in: Forge's fetch inside the app, the global fetch in tests and the CLI.
const API = "https://api.github.com";
const MAX_PRS = 5;

function client(fetch, token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "proof-of-done-jira", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return async (path) => {
    let res = await fetch(`${API}${path}`, { headers });
    // An expired or revoked token answers 401; public repositories still work without it, so drop it and carry on.
    if (res.status === 401 && headers.Authorization) {
      delete headers.Authorization;
      res = await fetch(`${API}${path}`, { headers });
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if ((res.status === 403 || res.status === 429) && /rate limit/i.test(body))
        throw new Error("GitHub's rate limit for requests without a token was reached. An admin should set GITHUB_TOKEN (a read-only token) so checks keep working.");
      if (res.status === 404) throw new Error(`GitHub repository not found or not readable: ${path.split("/").slice(2, 4).join("/")}. Check GITHUB_REPO, and set GITHUB_TOKEN for a private repository.`);
      throw new Error(`GitHub ${res.status} for ${path}: ${body}`);
    }
    return res.json();
  };
}

// A key like SHOP-12 must match as a whole word, so SHOP-1 does not match SHOP-12.
export const mentions = (text, key) => new RegExp(`(^|[^A-Za-z0-9-])${key}(?![0-9])`, "i").test(text ?? "");

async function pages(get, path, max = 3) {
  const all = [];
  for (let page = 1; page <= max; page++) {
    const items = await get(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    const list = Array.isArray(items) ? items : items.check_runs ?? [];
    all.push(...list);
    if (list.length < 100) break;
  }
  return all;
}

/** Pull requests in `repo` ("owner/name") whose title or branch mentions `key`. */
export async function linkedPullRequests({ fetch, token, repo, key }) {
  const get = client(fetch, token);
  // Search covers titles across the whole history; GitHub search does not look at branch names,
  // so the most recently updated PRs are also checked by branch name.
  const recent = await get(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=100`);
  const found = await get(`/search/issues?q=${encodeURIComponent(`${key} repo:${repo} is:pr`)}&per_page=20`);
  // The list already carries title, branch, merge state and head commit; only older PRs found by search need a lookup.
  const known = new Map(recent.filter((p) => mentions(p.title, key) || mentions(p.head?.ref, key)).map((p) => [p.number, p]));
  const numbers = [...new Set([...known.keys(), ...(found.items ?? []).filter((i) => mentions(i.title, key)).map((i) => i.number)])];
  const prs = [];
  for (const number of numbers) {
    if (prs.length === MAX_PRS) break;
    const pr = known.get(number) ?? (await get(`/repos/${repo}/pulls/${number}`));
    if (!mentions(pr.title, key) && !mentions(pr.head?.ref, key)) continue;
    const files = await pages(get, `/repos/${repo}/pulls/${pr.number}/files`);
    const checks = await pages(get, `/repos/${repo}/commits/${pr.head.sha}/check-runs`, 1);
    prs.push({
      number: pr.number,
      url: pr.html_url,
      merged: Boolean(pr.merged_at),
      files: files.map((f) => f.filename),
      diff: files.map((f) => `diff --git a/${f.filename} b/${f.filename}\n${f.status === "removed" ? "deleted file mode 100644\n" : ""}--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch ?? ""}\n`).join(""),
      checks: checks.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion })),
    });
  }
  return prs;
}
