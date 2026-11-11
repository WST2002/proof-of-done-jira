import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "../src/lib/timeline.js";

const diff = (path, removed, added) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n${removed.map((l) => `-${l}`).join("\n")}\n${added.map((l) => `+${l}`).join("\n")}\n`;

const commits = [
  { sha: "aaaaaaa1", message: "Apply the discount", date: "2026-11-11T10:00:00Z", diff: diff("src/price.js", ["return p"], ["return p * 0.9"]), ci: "failed" },
  { sha: "bbbbbbb2", message: "Make the test pass\n\nlonger body", date: "2026-11-11T10:05:00Z", diff: diff("test/price.test.js", ["  expect(price(10)).toBe(10);"], ["  expect(price(10)).toBeDefined();"]), ci: "passed" },
  { sha: "ccccccc3", message: "Tidy", date: "2026-11-11T10:09:00Z", diff: diff("src/price.js", ["// x"], ["// y"]), ci: "passed" },
];

test("each commit shows its own findings and CI result", () => {
  const t = buildTimeline(commits);
  assert.equal(t.entries.length, 3);
  assert.deepEqual(t.entries.map((e) => e.short), ["aaaaaaa", "bbbbbbb", "ccccccc"]);
  assert.equal(t.entries[0].title, "Apply the discount");
  assert.equal(t.entries[1].title, "Make the test pass");
  assert.deepEqual(t.entries[0].findings, []);
  assert.equal(t.entries[1].findings[0].kind, "weakened");
  assert.equal(t.entries[1].findings[0].before, "expect(price(10)).toBe(10);");
});

test("the first green CI run after a test was weakened is marked", () => {
  const t = buildTimeline(commits);
  assert.equal(t.greenAfterTampering, "bbbbbbb");
  assert.equal(t.entries[1].note, "CI turned green here, after the tests were changed to pass.");
  assert.equal(t.entries[2].note, undefined);
});

test("no tampering, no mark", () => {
  const t = buildTimeline([commits[0], commits[2]]);
  assert.equal(t.greenAfterTampering, null);
});
