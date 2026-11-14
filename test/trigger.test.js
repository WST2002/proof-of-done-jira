import { test } from "node:test";
import assert from "node:assert/strict";
import { afterDone } from "../src/lib/trigger.js";

test("a passing check leaves an audit receipt", () => {
  assert.equal(afterDone({ done: true, repo: "acme/shop" }), "receipt");
});

test("a project Proof of Done is not set up for gets no comment when its work moves to Done", () => {
  assert.equal(afterDone({ done: false, repo: "", message: "Proof of Done is not set up for this project yet" }), null);
});

test("a checked project whose work no longer passes gets the warning note", () => {
  assert.equal(afterDone({ done: false, repo: "acme/shop" }), "note");
});
