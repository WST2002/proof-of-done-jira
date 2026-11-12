import { test } from "node:test";
import assert from "node:assert/strict";
import { planSetup } from "../src/lib/setup.js";

const VAL = { ruleKey: "forge:expression-validator", id: "ari:x/static/proof-of-done-validator" };
const COND = { ruleKey: "forge:expression-condition", id: "ari:x/static/proof-of-done-condition" };
const statuses = [
  { id: "10001", name: "Done", statusReference: "10001", statusCategory: "DONE" },
  { id: "3", name: "In Progress", statusReference: "3", statusCategory: "IN_PROGRESS" },
];
const workflow = {
  id: "wf1", name: "Software Simplified Workflow for Project SHOP", version: { versionNumber: 3, id: "v3" }, statuses: [{ statusReference: "10001" }, { statusReference: "3" }],
  transitions: [
    { id: "41", name: "Done", toStatusReference: "10001", validators: [], conditions: null, actions: [] },
    { id: "31", name: "In Progress", toStatusReference: "3", validators: [], conditions: null, actions: [] },
  ],
};

test("the plan lists every transition into a Done status and what will be added", () => {
  const plan = planSetup({ workflow, statuses, validator: VAL, condition: COND });
  assert.deepEqual(plan.changes, [{ transition: "Done", to: "Done", add: ["validator", "condition"] }]);
  assert.equal(plan.alreadyDone, false);
});

test("the update adds the validator and condition only to Done transitions and keeps the rest", () => {
  const { update } = planSetup({ workflow, statuses, validator: VAL, condition: COND });
  const done = update.workflows[0].transitions.find((t) => t.id === "41");
  const other = update.workflows[0].transitions.find((t) => t.id === "31");
  assert.deepEqual(done.validators, [{ ruleKey: VAL.ruleKey, parameters: { key: VAL.id } }]);
  assert.deepEqual(done.conditions.conditions, [{ ruleKey: COND.ruleKey, parameters: { key: COND.id } }]);
  assert.deepEqual(other.validators, []);
  assert.equal(update.workflows[0].version.id, "v3");
});

test("a workflow that already has both is reported as already set up", () => {
  const set = planSetup({ workflow, statuses, validator: VAL, condition: COND }).update.workflows[0];
  const plan = planSetup({ workflow: { ...workflow, transitions: set.transitions }, statuses, validator: VAL, condition: COND });
  assert.equal(plan.alreadyDone, true);
  assert.deepEqual(plan.changes, []);
});
