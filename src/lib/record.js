// What each check leaves on the work item (issue property "proof-of-done"). The Done condition reads `passed`;
// the project dashboard reads the rest, so a team lead sees every block, catch and override in one place.
const MAX_CAUGHT = 4;
const short = (s, n = 160) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? "");

/** The record saved for a check result `v` (from evaluate()). */
export function checkRecord(v, at = new Date()) {
  const problems = v.problems ?? [];
  const caught = problems
    .filter((p) => p.kind === "tampering")
    .flatMap((p) => (p.evidence ?? []).map((e) => ({ pr: p.pr, url: p.url, file: e.file, line: e.line ?? null, says: e.says })))
    .slice(0, MAX_CAUGHT);
  return {
    passed: Boolean(v.done),
    problems: problems.length,
    checkedAt: at.toISOString(),
    kinds: [...new Set(problems.map((p) => p.kind))],
    blocker: v.done ? "" : short(problems[0]?.text || v.message?.split("\n")[0]),
    caught,
    overridden: v.overridden ? { accountId: v.overridden.accountId, reason: short(v.overridden.reason, 200), at: v.overridden.at } : null,
    skipped: Boolean(v.skipped),
  };
}
