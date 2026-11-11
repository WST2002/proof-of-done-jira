import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFindings } from "../bitbucket-merge-check/src/describe.js";
import { findTampering } from "../src/lib/tamper.js";

test("a clean diff passes the merge check", () => {
  assert.deepEqual(describeFindings([]), { success: true, message: "Proof of Done: no weakened, skipped or deleted tests." });
});

test("a weakened assertion fails the merge check with file and line", async () => {
  const res = await fetch("https://api.bitbucket.org/2.0/repositories/wst2002rk/shop-demo/pullrequests/2/diff");
  const r = describeFindings(findTampering(await res.text()));
  assert.equal(r.success, false);
  assert.match(r.message, /test\/price\.test\.js:10 replaces an exact assertion with a weaker one/);
});
