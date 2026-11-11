import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "../src/lib/verdict.js";

const diff = (path, removed, added) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n${removed.map((l) => `-${l}`).join("\n")}\n${added.map((l) => `+${l}`).join("\n")}\n`;

const goodPr = {
  number: 7,
  url: "https://github.com/acme/shop/pull/7",
  merged: true,
  files: ["src/price.js", "test/price.test.js"],
  diff: diff("src/price.js", ["return p"], ["return p * 0.9"]) + diff("test/price.test.js", ["expect(f(10)).toBe(10)"], ["expect(f(10)).toBe(9)"]),
  checks: [{ name: "test", status: "completed", conclusion: "success" }],
};

const kinds = (v) => v.problems.map((p) => p.kind);

test("a merged PR with passing test checks and an updated test is done", () => {
  const v = verdict([goodPr]);
  assert.equal(v.done, true);
  assert.deepEqual(v.problems, []);
});

test("no linked pull request blocks Done", () => {
  const v = verdict([]);
  assert.equal(v.done, false);
  assert.deepEqual(kinds(v), ["no-pr"]);
});

test("an open (not merged) pull request blocks Done", () => {
  assert.deepEqual(kinds(verdict([{ ...goodPr, merged: false }])), ["not-merged"]);
});

test("a failing check blocks Done and names the check", () => {
  const v = verdict([{ ...goodPr, checks: [{ name: "unit tests", status: "completed", conclusion: "failure" }] }]);
  assert.deepEqual(kinds(v), ["check-failed"]);
  assert.match(v.problems[0].text, /unit tests/);
});

test("a check still running blocks Done", () => {
  assert.deepEqual(kinds(verdict([{ ...goodPr, checks: [{ name: "test", status: "in_progress", conclusion: null }] }])), ["check-pending"]);
});

test("no checks at all means no proof that tests ran", () => {
  assert.deepEqual(kinds(verdict([{ ...goodPr, checks: [] }])), ["no-checks"]);
});

test("skipped test checks do not count as passing", () => {
  assert.deepEqual(kinds(verdict([{ ...goodPr, checks: [{ name: "test", status: "completed", conclusion: "skipped" }] }])), ["no-checks"]);
});

test("code changed without any test change is flagged", () => {
  const pr = { ...goodPr, files: ["src/price.js"], diff: diff("src/price.js", ["return p"], ["return p * 0.9"]) };
  assert.deepEqual(kinds(verdict([pr])), ["no-test-change"]);
});

test("docs-only changes need no test change", () => {
  const pr = { ...goodPr, files: ["README.md"], diff: diff("README.md", ["old"], ["new"]) };
  assert.deepEqual(kinds(verdict([pr])), []);
});

test("CI and editor config changes need no test change", () => {
  const pr = { ...goodPr, files: [".github/workflows/test.yml"], diff: diff(".github/workflows/test.yml", ["node-version: 20"], ["node-version: 22"]) };
  assert.deepEqual(kinds(verdict([pr])), []);
});

test("a weakened assertion blocks Done with file and line", () => {
  const pr = { ...goodPr, diff: diff("src/price.js", ["return p"], ["return p * 0.9"]) + diff("test/price.test.js", ["expect(f(10)).toBe(10)"], ["expect(f(10)).toBeDefined()"]) };
  const v = verdict([pr]);
  assert.deepEqual(kinds(v), ["tampering"]);
  assert.match(v.problems[0].text, /test\/price\.test\.js:1/);
});

test("a skipped test blocks Done", () => {
  const pr = { ...goodPr, diff: diff("src/price.js", ["return p"], ["return p * 0.9"]) + diff("test/price.test.js", ["it('rounds', () => {"], ["it.skip('rounds', () => {"]) };
  assert.deepEqual(kinds(verdict([pr])), ["tampering"]);
});

test("each linked PR is checked; problems say which PR", () => {
  const v = verdict([goodPr, { ...goodPr, number: 9, url: "https://github.com/acme/shop/pull/9", merged: false }]);
  assert.deepEqual(kinds(v), ["not-merged"]);
  assert.match(v.problems[0].text, /#9/);
});

test("the message lists every problem and what to do", () => {
  const v = verdict([{ ...goodPr, merged: false, checks: [] }]);
  assert.match(v.message, /not merged/i);
  assert.match(v.message, /no test run/i);
});

test("the block message tells people how to mark work that needs no code", () => {
  assert.match(verdict([]).message, /label "no-code"/);
  assert.match(verdict([], { skipLabel: "docs-only" }).message, /label "docs-only"/);
});

test("a swallowed error is a warning, not a block", () => {
  const pr = { ...goodPr, diff: goodPr.diff + diff("src/save.js", ["  await save(cart);"], ["  await save(cart).catch(() => {});"]) };
  const v = verdict([pr]);
  assert.equal(v.done, true);
  assert.deepEqual(v.problems, []);
  assert.equal(v.warnings.length, 1);
  assert.match(v.warnings[0].text, /src\/save\.js:1 drops an error without handling it/);
  assert.match(v.message, /Heads-up/);
});

test("raised timeouts and new retries block Done", () => {
  const pr = { ...goodPr, diff: goodPr.diff + diff("test/load.test.js", ["jest.setTimeout(5000);"], ["jest.setTimeout(60000);", "jest.retryTimes(3);"]) };
  const v = verdict([pr]);
  assert.equal(v.done, false);
  assert.match(v.problems[0].text, /raises a test timeout/);
  assert.match(v.problems[0].text, /retries a failing test/);
});

test("an AI-written PR without a new exact assertion is blocked", () => {
  const pr = { ...goodPr, ai: "Claude", diff: diff("src/price.js", ["return p"], ["return p * 0.9"]) + diff("test/price.test.js", ["// old"], ["// renamed comment"]) };
  const v = verdict([pr]);
  assert.equal(v.done, false);
  assert.match(v.problems.find((p) => p.kind === "ai-no-assertion").text, /written with Claude and adds no new exact assertion/);
});

test("an AI-written PR with a new exact assertion passes", () => {
  assert.equal(verdict([{ ...goodPr, ai: "Claude" }]).done, true);
});

test("a weakened assertion carries its before and after for the panel", () => {
  const pr = { ...goodPr, diff: diff("src/price.js", ["return p"], ["return p * 0.9"]) + diff("test/price.test.js", ["expect(f(10)).toBe(10)"], ["expect(f(10)).toBeDefined()"]) };
  const [ev] = verdict([pr]).problems.find((p) => p.kind === "tampering").evidence;
  assert.deepEqual(ev, { file: "test/price.test.js", line: 1, kind: "weakened", says: "replaces an exact assertion with a weaker one", before: "expect(f(10)).toBe(10)", after: "expect(f(10)).toBeDefined()" });
});
