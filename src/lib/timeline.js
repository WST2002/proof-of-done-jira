// Test Integrity Timeline: what each commit in a pull request did to the tests, and where CI turned green.
import { findTampering } from "./tamper.js";

const SAYS = {
  "deleted-file": "deleted a test file",
  "removed-tests": "removed tests",
  suppressed: "hid an error or warning",
  skipped: "skipped or focused tests",
  "always-passes": "added an assertion that can never fail",
  weakened: "weakened an exact assertion",
  threshold: "lowered a coverage threshold",
  timeout: "raised a test timeout",
  retry: "added retries to a failing test",
};

/** commits: [{ sha, message, date, diff, ci: "passed" | "failed" | "running" | "none" }] oldest first. */
export function buildTimeline(commits) {
  let tampered = false;
  let greenAfterTampering = null;
  const entries = commits.map((c) => {
    const findings = findTampering(c.diff ?? "")
      .filter((f) => f.kind !== "swallowed")
      .map(({ file, line, kind, text, before }) => ({ file, line, kind, says: SAYS[kind], after: text, before }));
    if (findings.length) tampered = true;
    const entry = { sha: c.sha, short: c.sha.slice(0, 7), title: (c.message ?? "").split("\n")[0], date: c.date, ci: c.ci ?? "none", findings };
    if (tampered && !greenAfterTampering && entry.ci === "passed") {
      greenAfterTampering = entry.short;
      entry.note = "CI turned green here, after the tests were changed to pass.";
    }
    return entry;
  });
  return { entries, greenAfterTampering };
}
