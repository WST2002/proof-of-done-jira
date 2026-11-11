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

test("words inside a regex literal are not code either", () => {
  const d = diff("src/rules.js", ["const A = 1;"], ["const SUPPRESS = /@ts-(ignore|nocheck)\b|eslint-disable|#\s*noqa\b/;", "if (/eslint-disable/.test(line)) count++;"]);
  assert.deepEqual(kinds(d), []);
});

test("a comment after code with a regex is still a suppression", () => {
  assert.deepEqual(kinds(diff("src/a.js", ["const a = 1;"], ["const re = /a+/g; // eslint-disable-line no-control-regex"])), ["suppressed"]);
});

test("turning a test off is caught; a runtime skip with a reason is not", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["it('rounds', () => {"], ["it.skip('rounds', () => {"])), ["skipped"]);
  assert.deepEqual(kinds(diff("test/a.test.js", ["describe('cart', () => {"], ["describe.only('cart', () => {"])), ["skipped"]);
  assert.deepEqual(kinds(diff("test/a.test.js", ["  const tool = find();"], ["  if (!tool) return t.skip('no clipboard tool on this machine');"])), []);
});

test("raising a test timeout is caught", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["jest.setTimeout(5000);"], ["jest.setTimeout(60000);"])), ["timeout"]);
  assert.deepEqual(kinds(diff("test/a.test.js", ["test('loads', async () => {", "}, 2000);"], ["test('loads', async () => {", "}, 30000);"])), ["timeout"]);
  assert.deepEqual(kinds(diff("test/a.test.js", ["  this.timeout(2000);"], ["  this.timeout(20000);"])), ["timeout"]);
  assert.deepEqual(kinds(diff("jest.config.js", ["  testTimeout: 5000,"], ["  testTimeout: 120000,"])), ["timeout"]);
});

test("lowering a timeout is fine", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["jest.setTimeout(60000);"], ["jest.setTimeout(5000);"])), []);
});

test("adding retries to hide a flaky test is caught", () => {
  assert.deepEqual(kinds(diff("test/a.test.js", ["const x = 1;"], ["jest.retryTimes(3);"])), ["retry"]);
  assert.deepEqual(kinds(diff("test/test_cart.py", ["import pytest"], ["@pytest.mark.flaky(reruns=3)"])), ["retry"]);
  assert.deepEqual(kinds(diff("playwright.config.ts", ["  retries: 0,"], ["  retries: 3,"])), ["retry"]);
});

test("swallowing an error in code is caught", () => {
  assert.deepEqual(kinds(diff("src/cart.js", ["  return load();"], ["  try { return load(); } catch (e) { return []; }"])), ["swallowed"]);
  assert.deepEqual(kinds(diff("src/cart.js", ["  await save(cart);"], ["  await save(cart).catch(() => {});"])), ["swallowed"]);
  assert.deepEqual(kinds(diff("src/cart.py", ["    save(cart)"], ["    except Exception:", "        pass"])), ["swallowed"]);
});

test("handling an error properly is not a swallow", () => {
  assert.deepEqual(kinds(diff("src/cart.js", ["  return load();"], ["  try { return load(); } catch (e) { log(e); throw e; }"])), []);
  assert.deepEqual(kinds(diff("src/cart.js", ["  const a = 1;"], ["  // returns [] when the cart is empty"])), []);
});
