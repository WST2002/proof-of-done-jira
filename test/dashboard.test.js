import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "../src/lib/verdict.js";
import { checkRecord } from "../src/lib/record.js";
import { summarize, byProject } from "../src/lib/dashboard.js";
import { fixTask, pickIssueType } from "../src/lib/fixtask.js";

const diff = (path, removed, added) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n${removed.map((l) => `-${l}`).join("\n")}\n${added.map((l) => `+${l}`).join("\n")}\n`;
const pr = (number, testBefore, testAfter, extra = {}) => ({
  number,
  url: `https://github.com/acme/shop/pull/${number}`,
  merged: true,
  files: ["src/cart.js", "test/cart.test.js"],
  diff: diff("src/cart.js", ["return n"], ["return Math.floor(n)"]) + diff("test/cart.test.js", [testBefore], [testAfter]),
  checks: [{ name: "test", status: "completed", conclusion: "success" }],
  ...extra,
});

const honest = verdict([pr(1, "assert.equal(total(cart), 100);", "assert.equal(total(cart), 90);")]);
const weakened = verdict([pr(2, "assert.equal(roundPrice(10.456), 10.46);", "assert.ok(roundPrice(10.456));")]);
const unmerged = verdict([pr(3, "assert.equal(tax(10), 1.8);", "assert.equal(tax(10), 1.9);", { merged: false })]);
const at = new Date("2026-11-13T01:00:00Z");

test("the saved record keeps what the dashboard needs: passed, kinds, the blocker and each caught change", () => {
  const r = checkRecord(weakened, at);
  assert.equal(r.passed, false);
  assert.equal(r.checkedAt, "2026-11-13T01:00:00.000Z");
  assert.deepEqual(r.kinds, ["tampering"]);
  assert.match(r.blocker, /PR #2/);
  assert.equal(r.caught.length, 1);
  assert.equal(r.caught[0].file, "test/cart.test.js");
  assert.equal(r.caught[0].pr, 2);
  assert.match(r.caught[0].says, /weaker/);
  assert.equal(r.overridden, null);
});

test("a passing record has no blocker, and an override is kept with its reason", () => {
  assert.equal(checkRecord(honest, at).blocker, "");
  const r = checkRecord({ ...weakened, done: true, overridden: { accountId: "abc", reason: "approved by finance, see FIN-12", at: "2026-11-12T10:00:00Z" } }, at);
  assert.equal(r.passed, true);
  assert.deepEqual(r.overridden, { accountId: "abc", reason: "approved by finance, see FIN-12", at: "2026-11-12T10:00:00Z" });
});

test("the dashboard counts ready, blocked, caught, overridden and unchecked work items", () => {
  const issues = [
    { key: "SHOP-1", summary: "Discount", status: "Done", record: checkRecord(honest, at) },
    { key: "SHOP-2", summary: "Rounding", status: "In Progress", record: checkRecord(weakened, at) },
    { key: "SHOP-3", summary: "Tax", status: "In Review", record: checkRecord(unmerged, at) },
    { key: "SHOP-4", summary: "Shipping", status: "Done", record: checkRecord({ ...weakened, done: true, overridden: { accountId: "abc", reason: "approved" } }, at) },
    { key: "SHOP-5", summary: "Design review", status: "Done", record: checkRecord({ done: true, skipped: true, problems: [] }, at) },
    { key: "SHOP-6", summary: "Not opened yet", status: "To Do" },
  ];
  const d = summarize(issues);
  assert.deepEqual(d.counts, { checked: 5, ready: 1, blocked: 2, caught: 2, overridden: 1, noCode: 1, unchecked: 1 });
  assert.deepEqual(d.blocked.map((b) => b.key), ["SHOP-2", "SHOP-3"]);
  assert.match(d.blocked[1].blocker, /not merged/);
  assert.deepEqual(d.caught.map((c) => c.key), ["SHOP-2", "SHOP-4"]);
  assert.equal(d.overrides[0].key, "SHOP-4");
  assert.equal(d.overrides[0].reason, "approved");
});

test("an override saved before records carried it still shows on the dashboard", () => {
  const d = summarize([{ key: "SHOP-7", summary: "Old", status: "Done", record: { passed: true, problems: 0 }, override: { accountId: "x", reason: "old reason", at: "2026-11-01T00:00:00Z" } }]);
  assert.equal(d.counts.overridden, 1);
  assert.equal(d.counts.ready, 0);
  assert.equal(d.overrides[0].reason, "old reason");
});

test("the settings page groups the counts by project, busiest first, and skips projects never checked", () => {
  const rows = byProject([
    { key: "PAY-1", record: checkRecord(weakened, at) },
    { key: "SHOP-1", record: checkRecord(honest, at) },
    { key: "SHOP-2", record: checkRecord(weakened, at) },
    { key: "OPS-1" },
  ]);
  assert.deepEqual(rows.map((r) => [r.project, r.checked, r.blocked, r.caught]), [["SHOP", 2, 1, 1], ["PAY", 1, 1, 1]]);
});

test("the fix task names the weakened test, shows before and after, and says how to close the loop", () => {
  const t = fixTask("SHOP-2", weakened);
  assert.equal(t.summary, "Restore the tests weakened for SHOP-2 (PR #2)");
  const body = JSON.stringify(t.description);
  assert.match(body, /test\/cart\.test\.js/);
  assert.match(body, /assert\.equal\(roundPrice\(10\.456\), 10\.46\);/);
  assert.match(body, /assert\.ok\(roundPrice\(10\.456\)\);/);
  assert.match(body, /https:\/\/github\.com\/acme\/shop\/pull\/2/);
  assert.match(body, /press Check again on SHOP-2/);
});

test("a block without tampering gets a plain fix task that lists what is missing", () => {
  const t = fixTask("SHOP-3", unmerged);
  assert.equal(t.summary, "Fix what keeps SHOP-3 out of Done (PR #3)");
  assert.match(JSON.stringify(t.description), /is not merged yet/);
});

test("the fix task is a sub-task when the project has one, otherwise a Task", () => {
  const types = [{ id: "1", name: "Epic", hierarchyLevel: 1 }, { id: "2", name: "Story" }, { id: "3", name: "Task" }, { id: "4", name: "Subtask", subtask: true, hierarchyLevel: -1 }];
  assert.deepEqual(pickIssueType(types), { id: "4", name: "Subtask", subtask: true });
  assert.deepEqual(pickIssueType(types, { parentIsSubtask: true }), { id: "3", name: "Task", subtask: false });
  assert.deepEqual(pickIssueType(types.filter((t) => !t.subtask)), { id: "3", name: "Task", subtask: false });
  assert.equal(pickIssueType([]), null);
});
