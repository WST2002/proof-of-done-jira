// Reads the pull requests that mention a Jira key from GitHub: merged state, changed files, diff, check runs.
import { detectAI } from "./ai.js";
import { isTestFile } from "./tamper.js";
// `fetch` is passed in: Forge's fetch inside the app, the global fetch in tests and the CLI.
const API = "https://api.github.com";
const MAX_PRS = 10;
const MAX_FILES = 300;

function client(fetch, token) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "proof-of-done-jira", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // asDiff: the raw unified diff of a pull request, which also carries changes the files API leaves out.
  return async (path, asDiff = false) => {
    const send = () => fetch(`${API}${path}`, { headers: asDiff ? { ...headers, Accept: "application/vnd.github.diff" } : headers });
    let res = await send();
    // An expired or revoked token answers 401; public repositories still work without it, so drop it and carry on.
    if (res.status === 401 && headers.Authorization) {
      delete headers.Authorization;
      res = await send();
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      if ((res.status === 403 || res.status === 429) && /rate limit/i.test(body))
        throw new Error("GitHub's rate limit for requests without a token was reached. An admin should set GITHUB_TOKEN (a read-only token) so checks keep working.");
      if (res.status === 404) throw new Error(`GitHub repository not found or not readable: ${path.split("/").slice(2, 4).join("/")}. Check GITHUB_REPO, and set GITHUB_TOKEN for a private repository.`);
      throw new Error(`GitHub ${res.status} for ${path}: ${body}`);
    }
    return asDiff ? res.text() : res.json();
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

// CI results for a commit: check runs (GitHub Actions and most apps), or the older commit statuses some CI services still use.
async function checksOf(get, repo, sha) {
  const runs = await pages(get, `/repos/${repo}/commits/${sha}/check-runs`, 1);
  // A workflow on both push and pull_request runs the same check twice on one commit: keep the latest run of each.
  const latest = new Map();
  for (const r of runs) {
    const seen = latest.get(r.name);
    if (!seen || (r.started_at ?? "") > (seen.started_at ?? "")) latest.set(r.name, r);
  }
  if (runs.length) return [...latest.values()];
  const combined = await get(`/repos/${repo}/commits/${sha}/status`);
  return (combined.statuses ?? []).map((s) => ({ name: s.context, html_url: s.target_url, status: s.state === "pending" ? "in_progress" : "completed", conclusion: s.state === "success" ? "success" : s.state === "pending" ? null : "failure" }));
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
  // Never check only some of the linked work: past the limit, Done is blocked with the reason.
  if (numbers.length > MAX_PRS) throw new Error(`${numbers.length} pull requests mention ${key}; Proof of Done reads up to ${MAX_PRS}. Split the work item, or rename old pull requests that no longer belong to it.`);
  const prs = [];
  for (const number of numbers) {
    const pr = known.get(number) ?? (await get(`/repos/${repo}/pulls/${number}`));
    if (!mentions(pr.title, key) && !mentions(pr.head?.ref, key)) continue;
    const files = await pages(get, `/repos/${repo}/pulls/${pr.number}/files`);
    if (files.length >= MAX_FILES) throw new Error(`PR #${pr.number} changes ${MAX_FILES} or more files, more than Proof of Done can read in full. Split it into smaller pull requests.`);
    // The files API leaves out the change of very large files. For a test file, read the whole pull request diff
    // instead; if even that lacks it, the test change cannot be called honest, so Done is blocked with the reason.
    const unreadable = files.find((f) => f.status !== "removed" && f.patch === undefined && isTestFile(f.filename) && f.changes > 0);
    let diff = files.map((f) => `diff --git a/${f.filename} b/${f.filename}\n${f.status === "removed" ? "deleted file mode 100644\n" : ""}--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch ?? ""}\n`).join("");
    if (unreadable) {
      diff = await pullRequestDiff({ fetch, token, repo, number: pr.number });
      const part = diff.split(/^diff --git /m).find((d) => d.startsWith(`a/${unreadable.filename} `));
      if (!part || !/^@@/m.test(part)) throw new Error(`GitHub did not return the change to ${unreadable.filename} in PR #${pr.number} (too large), so its tests cannot be verified.`);
    }
    const checks = await checksOf(get, repo, pr.head.sha);
    const commits = await pages(get, `/repos/${repo}/pulls/${pr.number}/commits`, 1);
    prs.push({
      number: pr.number,
      url: pr.html_url,
      sha: pr.head?.sha,
      merged: Boolean(pr.merged_at),
      files: files.map((f) => f.filename),
      diff,
      checks: checks.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url ?? c.details_url })),
      ai: detectAI([{ message: "", author: pr.user?.login }, ...commits.map((c) => ({ message: c.commit?.message, author: c.author?.login }))]),
    });
  }
  return prs;
}

// Only "success" is green: an unknown or new conclusion is never read as passed.
const ciOf = (runs) => {
  const ran = runs.filter((c) => c.conclusion !== "skipped" && c.conclusion !== "neutral");
  if (!ran.length) return "none";
  if (ran.some((c) => c.status === "completed" && c.conclusion !== "success")) return "failed";
  if (ran.some((c) => c.status !== "completed")) return "running";
  return "passed";
};

/** The last 10 commits of a pull request, oldest first, each with its own diff and CI result, for the timeline. */
export async function githubCommitHistory({ fetch, token, repo, number }) {
  const get = client(fetch, token);
  const commits = (await get(`/repos/${repo}/pulls/${number}/commits?per_page=100`)).slice(-10);
  const out = [];
  for (const c of commits) {
    const detail = await get(`/repos/${repo}/commits/${c.sha}`);
    const runs = await checksOf(get, repo, c.sha);
    out.push({
      sha: c.sha,
      message: c.commit?.message,
      date: c.commit?.committer?.date,
      diff: (detail.files ?? []).map((f) => `diff --git a/${f.filename} b/${f.filename}\n${f.status === "removed" ? "deleted file mode 100644\n" : f.status === "added" ? "new file mode 100644\n" : ""}--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch ?? ""}\n`).join(""),
      ci: ciOf(runs),
    });
  }
  return out;
}

/** Whether pull request `number` mentions `key` in its title or branch, so it belongs to that work item. */
export async function pullMentions({ fetch, token, repo, number, key }) {
  const pr = await client(fetch, token)(`/repos/${repo}/pulls/${Number(number)}`);
  return mentions(pr.title, key) || mentions(pr.head?.ref, key);
}

/** The whole unified diff of a pull request, including large files the files API leaves out. */
export const pullRequestDiff = ({ fetch, token, repo, number }) => client(fetch, token)(`/repos/${repo}/pulls/${Number(number)}`, true);

// Which GitHub access the checks really get: the first token GitHub accepts, or anonymous (60 requests an hour).
// tokens: [[label, token], ...] in order of use. /rate_limit itself does not count against the limit.
export async function githubAccess({ fetch, tokens }) {
  const base = { Accept: "application/vnd.github+json", "User-Agent": "proof-of-done-jira", "X-GitHub-Api-Version": "2022-11-28" };
  const core = async (headers) => {
    const res = await fetch(`${API}/rate_limit`, { headers });
    return res.ok ? (await res.json()).resources.core : null;
  };
  for (const [source, token] of tokens.filter(([, t]) => t)) {
    const c = await core({ ...base, Authorization: `Bearer ${token}` });
    if (c) return { source, limit: c.limit, remaining: c.remaining };
  }
  const c = await core(base);
  return { source: "none", limit: c?.limit ?? 60, remaining: c?.remaining ?? null };
}
