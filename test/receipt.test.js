import { test } from "node:test";
import assert from "node:assert/strict";
import { receipt } from "../src/lib/receipt.js";

const text = (doc) => JSON.stringify(doc);

test("a receipt lists each merged PR, its checks and the honesty result", () => {
  const doc = receipt({
    done: true, warnings: [], repo: "acme/shop",
    prs: [{ number: 12, url: "https://github.com/acme/shop/pull/12", merged: true, files: 4, ai: null, checks: [{ name: "test", status: "completed", conclusion: "success" }] }],
  }, new Date("2026-11-11T17:00:00Z"));
  assert.equal(doc.type, "doc");
  const t = text(doc);
  assert.match(t, /Proof of Done receipt/);
  assert.match(t, /PR #12/);
  assert.match(t, /https:\/\/github.com\/acme\/shop\/pull\/12/);
  assert.match(t, /test: passed/);
  assert.match(t, /No test was weakened, skipped or deleted/);
  assert.match(t, /11 Nov 2026/);
});

test("a no-code receipt says why no PR was needed", () => {
  const t = text(receipt({ done: true, skipped: true, message: "Skipped: this work item is labelled no-code, so it needs no pull request.", prs: [], warnings: [] }, new Date("2026-11-11T17:00:00Z")));
  assert.match(t, /labelled no-code/);
});

test("AI-written PRs and heads-up warnings are on the receipt", () => {
  const t = text(receipt({ done: true, warnings: [{ text: "PR #3: src/a.js:9 drops an error without handling it." }], prs: [{ number: 3, url: "u", merged: true, files: 2, ai: "Claude", checks: [] }] }, new Date()));
  assert.match(t, /written with Claude/);
  assert.match(t, /drops an error/);
});
