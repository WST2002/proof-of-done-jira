// The project dashboard: from the work items Jira returns (with their Proof of Done records), the numbers and
// lists a team lead needs: what is blocked now, which test shortcuts were caught, and who overrode what, and why.

/**
 * issues: [{ key, summary, status, statusCategory, record, override }] where `record` is the saved check
 * (see record.js) and `override` the saved override property, both possibly missing.
 */
export function summarize(issues) {
  const checked = issues.filter((i) => i.record);
  const overrideOf = (i) => i.record?.overridden ?? (i.override?.reason ? i.override : null);
  const blocked = checked.filter((i) => !i.record.passed && !overrideOf(i));
  const caught = checked.filter((i) => (i.record.kinds ?? []).includes("tampering"));
  const overrides = issues.filter((i) => overrideOf(i)).map((i) => ({ ...i, override: overrideOf(i) }));
  const row = (i) => ({ key: i.key, summary: i.summary, status: i.status, statusCategory: i.statusCategory });
  return {
    counts: {
      checked: checked.length,
      ready: checked.filter((i) => i.record.passed && !i.record.skipped && !overrideOf(i)).length,
      blocked: blocked.length,
      caught: caught.length,
      overridden: overrides.length,
      noCode: checked.filter((i) => i.record.skipped).length,
      unchecked: issues.length - checked.length,
    },
    blocked: blocked.map((i) => ({ ...row(i), blocker: i.record.blocker ?? "", checkedAt: i.record.checkedAt })),
    caught: caught.map((i) => ({ ...row(i), caught: i.record.caught ?? [] })),
    overrides: overrides.map((i) => ({ ...row(i), reason: i.override.reason, accountId: i.override.accountId, at: i.override.at })),
  };
}

/** Per-project counts for the settings page, busiest project first. */
export function byProject(issues) {
  const groups = new Map();
  for (const i of issues) {
    const project = i.key.split("-")[0];
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(i);
  }
  return [...groups.entries()]
    .map(([project, list]) => ({ project, ...summarize(list).counts }))
    .filter((p) => p.checked)
    .sort((a, b) => b.checked - a.checked || a.project.localeCompare(b.project));
}
