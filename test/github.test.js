// Real GitHub, no mocks: a merged PR in a public repo that mentions "0.4.2" in its title.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedPullRequests } from "../src/lib/github.js";
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

test("an expired or wrong token does not break the check: it falls back to no token", async () => {
  const prs = await linkedPullRequests({ fetch, token: "github_pat_expired_or_revoked_example", repo: "WST2002/proof-of-done-jira", key: "POD-1" });
  assert.deepEqual(prs.map((p) => p.number), [1]);
});
