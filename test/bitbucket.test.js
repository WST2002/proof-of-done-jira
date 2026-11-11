// Real Bitbucket Cloud, no mocks: the public demo repo wst2002rk/shop-demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedBitbucketPullRequests } from "../src/lib/bitbucket.js";
import { verdict } from "../src/lib/verdict.js";

const repo = "wst2002rk/shop-demo";

// Without a token Bitbucket allows few requests an hour per IP; skip with the reason instead of failing on a busy machine.
async function orSkip(t, run) {
  try {
    return await run();
  } catch (e) {
    if (/rate limit/.test(e.message)) return t.skip("Bitbucket rate limit reached on this machine");
    throw e;
  }
}

test("reads a Bitbucket PR's files and diff by the key in its title", (t) => orSkip(t, async () => {
  const [pr, ...rest] = await linkedBitbucketPullRequests({ fetch, repo, key: "SHOP-1" });
  assert.equal(rest.length, 0);
  assert.equal(pr.number, 1);
  for (const f of ["src/price.js", "test/price.test.js"]) assert.ok(pr.files.includes(f), `${f} missing from ${pr.files}`);
  assert.match(pr.diff, /^diff --git a\/src\/price\.js/m);
}));

test("a loosened assertion in a Bitbucket PR is caught", (t) => orSkip(t, async () => {
  const prs = await linkedBitbucketPullRequests({ fetch, repo, key: "SHOP-2" });
  const v = verdict(prs);
  assert.equal(v.done, false);
  const tamper = v.problems.find((p) => p.kind === "tampering");
  assert.ok(tamper, JSON.stringify(v.problems));
  assert.match(tamper.text, /test\/price\.test\.js:\d+ replaces an exact assertion with a weaker one/);
}));

test("a key with no Bitbucket PR finds nothing", (t) => orSkip(t, async () => {
  assert.deepEqual(await linkedBitbucketPullRequests({ fetch, repo, key: "SHOP-99" }), []);
}));
