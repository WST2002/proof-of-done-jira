import { test } from "node:test";
import assert from "node:assert/strict";
import { findTampering } from "../src/lib/tamper.js";

const diff = (path, removed, added) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n${removed.map((l) => `-${l}`).join("\n")}\n${added.map((l) => `+${l}`).join("\n")}\n`;
const kinds = (d) => findTampering(d).map((f) => f.kind);

test("node:assert equal turned into assert.ok is a weakened assertion", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["  assert.equal(total, 9);"], ["  assert.ok(total);"])), ["weakened"]);
});

test("deepEqual turned into a bare assert(x) is a weakened assertion", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["  assert.deepEqual(list, [1, 2]);"], ["  assert(list);"])), ["weakened"]);
});

test("a new assert.ok next to an exact assert is not flagged", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["  const x = 1;"], ["  assert.ok(Array.isArray(list));"])), []);
});

test("jest toBe turned into toBeDefined is still caught", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["expect(f(10)).toBe(9)"], ["expect(f(10)).toBeDefined()"])), ["weakened"]);
});

test("a deleted test file and an eslint-disable are both caught", () => {
  const del = "diff --git a/test/b.test.js b/test/b.test.js\ndeleted file mode 100644\n--- a/test/b.test.js\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-test('x', () => {})\n";
  assert.deepEqual(kinds(del), ["deleted-file"]);
  assert.deepEqual(kinds(diff("src/a.js", ["const a = 1;"], ["// eslint-disable-next-line no-unused-vars", "const a = 1;"])), ["suppressed"]);
});

test("a Jira key matches only as a whole key", async () => {
  const { mentions } = await import("../src/lib/github.js");
  assert.equal(mentions("POD-1: run tests", "POD-1"), true);
  assert.equal(mentions("feature/pod-1-run-tests", "POD-1"), true);
  assert.equal(mentions("POD-10: other work", "POD-1"), false);
  assert.equal(mentions("XPOD-1 something", "POD-1"), false);
  assert.equal(mentions("Fixes POD-1.", "POD-1"), true);
});

test("the words eslint-disable inside a string or test name are not a suppression", () => {
  const d = diff("test/a.test.js", ["const a = 1;"], ['test("an eslint-disable is caught", () => {', '  assert.deepEqual(kinds("// eslint-disable-next-line"), ["suppressed"]);']);
  assert.deepEqual(kinds(d), []);
});

test("real suppression comments are still caught", () => {
  for (const line of ["// eslint-disable-next-line no-console", "/* eslint-disable */", "  // @ts-ignore", "x = 1  # noqa", "y = f()  # type: ignore"]) {
    assert.deepEqual(kinds(diff("src/a.js", ["const a = 1;"], [line])), ["suppressed"], line);
  }
});

test("a new assert.ok in the same hunk as an unrelated removed assert is not a weakening", () => {
  const d = diff("test/a.test.js", ["  assert.deepEqual(await load({ repo }), []);"], ["  assert.deepEqual(await load({ repo, token }), []);", "  assert.ok(prs.some((p) => p.number === 8));"]);
  assert.deepEqual(kinds(d), []);
});

test("weakening the same subject is still caught for jest and node:assert", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["  expect(total(cart)).toBe(90);"], ["  expect(total(cart)).toBeDefined();"])), ["weakened"]);
  assert.deepEqual(kinds(diff("test/a.test.js", ["  assert.equal(v.done, true);"], ["  assert.ok(v.done);"])), ["weakened"]);
});
