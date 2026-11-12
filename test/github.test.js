// Real GitHub, no mocks: a merged PR in a public repo that mentions "0.4.2" in its title.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedPullRequests, pullMentions, pullRequestDiff } from "../src/lib/github.js";
import { verdict } from "../src/lib/verdict.js";

test("finds the PR that mentions the key and reads its files, diff and checks", async () => {
  const prs = await linkedPullRequests({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/claude-code-skills", key: "0.4.2" });
  const pr = prs.find((p) => p.number === 18);
  assert.ok(pr, `PR #18 not found in ${prs.map((p) => p.number)}`);
  assert.equal(pr.merged, true);
  assert.ok(pr.files.some((f) => f.includes("proof-of-done")), pr.files.join(","));
  assert.match(pr.diff, /^diff --git a\//m);
  assert.ok(pr.checks.length > 0, "no check runs read");
  assert.ok(pr.checks.every((c) => c.status === "completed"));
  console.log(verdict([pr]).message);
});

test("a key that appears nowhere finds no PR", async () => {
  assert.deepEqual(await linkedPullRequests({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/claude-code-skills", key: "NOPE-98765" }), []);
});

test("finds a PR whose key is only in the branch name, not the title", async () => {
  const prs = await linkedPullRequests({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/proof-of-done-jira", key: "POD-9" });
  assert.ok(prs.some((p) => p.number === 8), `PR #8 (branch pod-9-readme-wording) not found in ${prs.map((p) => p.number)}`);
});

test("a similar key does not pull in the wrong PR", async () => {
  const prs = await linkedPullRequests({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/proof-of-done-jira", key: "POD-1" });
  assert.deepEqual(prs.map((p) => p.number), [1]);
});

test("a wrong repository gives a clear setup message", async () => {
  await assert.rejects(linkedPullRequests({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/no-such-repo-here", key: "POD-1" }), /not found or not readable: WST2002\/no-such-repo-here/);
});

test("an expired or wrong token does not break the check: it falls back to no token", async (t) => {
  // Without a token GitHub allows 60 requests an hour per IP, and shared CI runners often use them up.
  const left = await (await fetch("https://api.github.com/rate_limit")).json();
  if (left.resources.core.remaining < 10) return t.skip("no unauthenticated GitHub requests left on this machine");
  const prs = await linkedPullRequests({ fetch, token: "github_pat_expired_or_revoked_example", repo: "WST2002/proof-of-done-jira", key: "POD-1" });
  assert.deepEqual(prs.map((p) => p.number), [1]);
});

test("reads a PR's commits with their own diffs and CI results for the timeline", async () => {
  const { githubCommitHistory } = await import("../src/lib/github.js");
  const commits = await githubCommitHistory({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/proof-of-done-jira", number: 5 });
  assert.ok(commits.length >= 1);
  assert.match(commits.at(-1).diff, /assert\.ok\(v\.done\)/);
  assert.ok(["passed", "failed", "running", "none"].includes(commits.at(-1).ci));
});

test("more linked pull requests than it can read blocks with a clear reason instead of checking only some", async () => {
  await assert.rejects(linkedPullRequests({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/proof-of-done-jira", key: "POD" }), /pull requests mention POD; Proof of Done reads up to 10/);
});

test("the timeline is only read for a pull request that belongs to the work item", async () => {
  const opts = { fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/proof-of-done-jira", number: 26 };
  assert.equal(await pullMentions({ ...opts, key: "POD-32" }), true);
  assert.equal(await pullMentions({ ...opts, key: "POD-6" }), false);
});

test("the whole pull request diff can be read when the files list leaves a large file out", async () => {
  const diff = await pullRequestDiff({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/proof-of-done-jira", number: 26 });
  assert.match(diff, /^diff --git a\/test\/config\.test\.js b\/test\/config\.test\.js/m);
  assert.match(diff, /^\+.*assert\.ok\(checkSkipLabel/m);
});

test("a check that ran twice on the same commit (push and pull request) is listed once", async () => {
  const [pr] = await linkedPullRequests({ fetch, token: process.env.GITHUB_TOKEN, repo: "WST2002/proof-of-done-demo", key: "DEMO-2" });
  assert.deepEqual(pr.checks.map((c) => c.name), ["test"]);
  assert.equal(pr.checks[0].conclusion, "success");
});
