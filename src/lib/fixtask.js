// "Create a task to fix this": turns a block into the next piece of work, with the evidence written into it,
// so the person who picks it up knows the file, the line and what the test checked before.
const para = (...content) => ({ type: "paragraph", content });
const txt = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });
const link = (text, href) => txt(text, [{ type: "link", attrs: { href } }]);
const bold = (text) => txt(text, [{ type: "strong" }]);
const code = (text) => txt(text, [{ type: "code" }]);
const item = (...content) => ({ type: "listItem", content: [para(...content)] });
const list = (items) => ({ type: "bulletList", content: items });

/** Summary and description (Atlassian Document Format) of the fix task for blocked work item `key`. */
export function fixTask(key, v) {
  const problems = v.problems ?? [];
  const tampering = problems.filter((p) => p.kind === "tampering");
  const prs = [...new Set(problems.map((p) => p.pr).filter(Boolean))];
  const prText = prs.length ? ` (${prs.map((n) => `PR #${n}`).join(", ")})` : "";
  const summary = tampering.length ? `Restore the tests changed to pass for ${key}${prText}` : `Fix what keeps ${key} out of Done${prText}`;

  const content = [para(txt("Proof of Done blocked "), bold(key), txt(" from moving to Done. This task is the work to fix it."))];
  const others = problems.filter((p) => p.kind !== "tampering");
  if (others.length) content.push(para(bold("What is missing")), list(others.map((p) => item(txt(p.text)))));
  for (const p of tampering) {
    content.push(para(bold("Tests changed to pass"), txt(" in "), p.url ? link(`PR #${p.pr}`, p.url) : txt(`PR #${p.pr}`)));
    content.push(list((p.evidence ?? []).map((e) => item(
      bold(`${e.file}${e.line ? `:${e.line}` : ""}`),
      txt(` ${e.says}.`),
      ...(e.before ? [txt(" Before: "), code(e.before)] : []),
      ...(e.after ? [txt(e.before ? " After: " : " "), code(e.after)] : []),
      ...(e.why ? [txt(` ${e.why}`)] : []),
    ))));
  }
  content.push(para(bold("When it is fixed: "), txt(`put ${key} and this task's key in the fix pull request's title or branch (for example "${key}: restore the exact checks"), merge it with green CI, then press Check again on ${key}.`)));
  content.push(para(txt("Created by Proof of Done.", [{ type: "em" }])));
  return { summary: summary.length > 250 ? `${summary.slice(0, 249)}…` : summary, description: { type: "doc", version: 1, content } };
}

/** The issue type to create: a sub-task of the blocked work item when the project has one (and the work item is not
 *  a sub-task itself), else a Task (or any standard type). */
export function pickIssueType(types, { parentIsSubtask = false } = {}) {
  const usable = (types ?? []).filter((t) => !t.hierarchyLevel || t.hierarchyLevel <= 0);
  const sub = parentIsSubtask ? null : usable.find((t) => t.subtask);
  if (sub) return { id: sub.id, name: sub.name, subtask: true };
  const standard = usable.filter((t) => !t.subtask);
  const task = standard.find((t) => /^task$/i.test(t.name)) ?? standard[0];
  return task ? { id: task.id, name: task.name, subtask: false } : null;
}
