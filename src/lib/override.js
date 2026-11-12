// A recorded override: a project admin lets one blocked work item through, with a reason, for the exact commits checked.
// A new commit to any linked pull request makes the override stop applying, so it cannot hide later changes.

/** The saved override if it was given for exactly these pull request commits, else null. */
export function overrideFor(saved, prs) {
  if (!saved?.shas?.length || !prs?.length) return null;
  const now = prs.map((p) => p.sha).sort();
  const then = [...saved.shas].sort();
  return now.length === then.length && now.every((s, i) => s === then[i]) ? saved : null;
}

/** Why a reason is not good enough, or null. */
export const checkReason = (reason) => (String(reason ?? "").trim().length < 10 ? "Write a reason of at least 10 characters; it is kept on the work item." : null);
