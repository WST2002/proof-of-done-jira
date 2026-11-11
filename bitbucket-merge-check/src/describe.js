// Turns test-tampering findings into a merge check result Bitbucket shows on the pull request.
const SAYS = {
  "deleted-file": "deletes a test file",
  "removed-tests": "removes tests",
  suppressed: "hides an error or warning",
  skipped: "skips or focuses tests",
  "always-passes": "adds an assertion that can never fail",
  weakened: "replaces an exact assertion with a weaker one",
  threshold: "lowers a coverage threshold",
};
const MAX = 4;

export function describeFindings(findings) {
  if (!findings.length) return { success: true, message: "Proof of Done: no weakened, skipped or deleted tests." };
  const listed = findings.slice(0, MAX).map((f) => `${f.file}${f.line ? `:${f.line}` : ""} ${SAYS[f.kind]}`);
  if (findings.length > MAX) listed.push(`and ${findings.length - MAX} more`);
  return { success: false, message: `Proof of Done: this pull request can make checks pass without fixing anything: ${listed.join("; ")}.` };
}
