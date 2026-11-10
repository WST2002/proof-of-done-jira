// Real GitHub, no mocks: a merged PR in a public repo that mentions "0.4.2" in its title.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedPullRequests } from "../src/lib/github.js";
import { verdict } from "../src/lib/verdict.js";

test("finds the PR that mentions the key and reads its files, diff and checks", async () => {
  const prs = await linkedPullRequests({ fetch, repo: "WST2002/claude-code-skills", key: "0.4.2" });
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
  assert.deepEqual(await linkedPullRequests({ fetch, repo: "WST2002/claude-code-skills", key: "NOPE-98765" }), []);
});
