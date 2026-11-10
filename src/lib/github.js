// Reads the pull requests that mention a Jira key from GitHub: merged state, changed files, diff, check runs.
// `fetch` is passed in: Forge's fetch inside the app, the global fetch in tests and the CLI.
const API = "https://api.github.com";
const MAX_PRS = 5;

function client(fetch, token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "done-means-done", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return async (path) => {
    const res = await fetch(`${API}${path}`, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
}

// A key like SHOP-12 must match as a whole word, so SHOP-1 does not match SHOP-12.
const mentions = (text, key) => new RegExp(`(^|[^A-Za-z0-9-])${key}(?![0-9])`, "i").test(text ?? "");

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
  const found = await get(`/search/issues?q=${encodeURIComponent(`${key} repo:${repo} is:pr`)}&per_page=20`);
  const prs = [];
  for (const item of found.items ?? []) {
    if (prs.length === MAX_PRS) break;
    const pr = await get(`/repos/${repo}/pulls/${item.number}`);
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
