import { test } from "node:test";
import assert from "node:assert/strict";
import { overrideFor, checkReason } from "../src/lib/override.js";

const prs = [{ number: 2, sha: "aaa111" }, { number: 3, sha: "bbb222" }];
const saved = { accountId: "u1", at: "2026-11-12T08:00:00Z", reason: "Rounding change approved by finance", shas: ["aaa111", "bbb222"] };

test("an override applies only to the exact commits it was given for", () => {
  assert.deepEqual(overrideFor(saved, prs), saved);
  assert.equal(overrideFor(saved, [{ number: 2, sha: "aaa111" }, { number: 3, sha: "ccc333" }]), null);
  assert.equal(overrideFor(saved, [...prs, { number: 4, sha: "ddd444" }]), null);
  assert.equal(overrideFor(null, prs), null);
  assert.equal(overrideFor(saved, []), null);
});

test("an override needs a real reason", () => {
  assert.match(checkReason(""), /reason/);
  assert.match(checkReason("ok"), /reason/);
  assert.equal(checkReason("Rounding change approved by finance"), null);
});
