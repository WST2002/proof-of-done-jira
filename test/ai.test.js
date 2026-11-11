import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAI, addsExactAssertion } from "../src/lib/ai.js";

test("an AI co-author trailer marks the PR as AI-written", () => {
  assert.equal(detectAI([{ message: "Fix rounding\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>" }]), "Claude");
  assert.equal(detectAI([{ message: "x\n\nCo-authored-by: Copilot <copilot@github.com>" }]), "Copilot");
  assert.equal(detectAI([{ message: "Generated with Cursor" }]), "Cursor");
});

test("an AI bot author marks the PR as AI-written", () => {
  assert.equal(detectAI([{ message: "Initial plan", author: "copilot-swe-agent[bot]" }]), "Copilot");
  assert.equal(detectAI([{ message: "Fix", author: "devin-ai-integration[bot]" }]), "Devin");
});

test("ordinary commits are not AI-written", () => {
  assert.equal(detectAI([{ message: "Fix the claude wrapper config", author: "WST2002" }]), null);
  assert.equal(detectAI([]), null);
});

test("an AI-written PR must add at least one exact assertion", () => {
  const add = (path, line) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n x\n+${line}\n`;
  assert.equal(addsExactAssertion(add("test/a.test.js", "  assert.equal(total([1]), 41);")), true);
  assert.equal(addsExactAssertion(add("test/a.test.js", "  expect(total([1])).toBe(41);")), true);
  assert.equal(addsExactAssertion(add("test/a.test.js", "  assert.ok(total([1]));")), false);
  assert.equal(addsExactAssertion(add("src/a.js", "  assert.equal(x, 1);")), false);
});
