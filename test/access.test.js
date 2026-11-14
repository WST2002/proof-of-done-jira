import { test } from "node:test";
import assert from "node:assert/strict";
import { githubAccess } from "../src/lib/github.js";

test("with no token, the checks get GitHub's anonymous limit of 60 requests an hour", async () => {
  const a = await githubAccess({ fetch, tokens: [] });
  assert.equal(a.source, "none");
  assert.equal(a.limit, 60);
});

test("a token GitHub rejects is skipped, so an expired token shows as no token instead of looking fine", async () => {
  const a = await githubAccess({ fetch, tokens: [["your token", "github_pat_expired_or_revoked_example"]] });
  assert.equal(a.source, "none");
  assert.equal(a.limit, 60);
});

test("a working token is reported with its own limit", { skip: !process.env.GITHUB_TOKEN && "needs GITHUB_TOKEN" }, async () => {
  const a = await githubAccess({ fetch, tokens: [["the app's built-in token", process.env.GITHUB_TOKEN]] });
  assert.equal(a.source, "the app's built-in token");
  assert.ok(a.limit >= 5000);
});
