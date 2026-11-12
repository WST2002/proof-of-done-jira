// Guided setup: which transitions into Done get the Proof of Done validator and condition, as a preview and as a workflow update.

const has = (list, rule) => (list ?? []).some((r) => r.ruleKey === rule.ruleKey && r.parameters?.key === rule.id);

/** workflow and statuses from POST /rest/api/3/workflows; validator/condition are this app's rules from /workflows/capabilities. */
export function planSetup({ workflow, statuses, validator, condition }) {
  const doneRefs = new Set(statuses.filter((s) => s.statusCategory === "DONE").map((s) => s.statusReference));
  const nameOf = (ref) => statuses.find((s) => s.statusReference === ref)?.name ?? ref;
  const changes = [];
  const transitions = workflow.transitions.map((t) => {
    if (!doneRefs.has(t.toStatusReference)) return t;
    const add = [];
    const next = { ...t };
    if (!has(t.validators, validator)) {
      next.validators = [...(t.validators ?? []), { ruleKey: validator.ruleKey, parameters: { key: validator.id } }];
      add.push("validator");
    }
    if (!has(t.conditions?.conditions, condition)) {
      next.conditions = { operation: "ALL", conditionGroups: t.conditions?.conditionGroups ?? [], conditions: [...(t.conditions?.conditions ?? []), { ruleKey: condition.ruleKey, parameters: { key: condition.id } }] };
      add.push("condition");
    }
    if (add.length) changes.push({ transition: t.name, to: nameOf(t.toStatusReference), add });
    return next;
  });
  const update = {
    statuses: statuses.map(({ id, name, statusCategory, statusReference }) => ({ id, name, statusCategory, statusReference })),
    workflows: [{ id: workflow.id, version: workflow.version, statuses: workflow.statuses, transitions, description: workflow.description }],
  };
  return { workflow: workflow.name, changes, alreadyDone: changes.length === 0, update };
}
