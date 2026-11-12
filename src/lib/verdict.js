// Decides whether a Jira work item may move to Done, from the pull requests linked to it.
// A PR counts only when it is merged, its checks ran and passed, code changes come with test changes,
// and no test was weakened, skipped or deleted to get there.
import { findTampering, isTestFile } from "./tamper.js";
import { addsExactAssertion } from "./ai.js";

const NON_CODE = /\.(md|mdx|txt|rst|png|jpe?g|gif|svg|lock)$|(^|\/)(docs?|\.github|\.vscode)\/|(^|\/)\.(editorconfig|gitignore|gitattributes)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|LICENSE)$/i;
const RUNNING = new Set(["queued", "in_progress", "pending", "waiting", "requested"]);
const FAILED = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);
const MAX_FINDINGS = 4;

const DESCRIBE = {
  "deleted-file": "deletes a test file",
  "removed-tests": "removes tests",
  suppressed: "hides an error or warning",
  skipped: "skips or focuses tests",
  "always-passes": "adds an assertion that can never fail",
  weakened: "replaces an exact assertion with a weaker one",
  threshold: "lowers a coverage threshold",
  timeout: "raises a test timeout",
  retry: "retries a failing test until it passes",
  swallowed: "drops an error without handling it",
};
// Why each change is suspicious, in words a reviewer who skips the diff still understands.
const WHY = {
  "deleted-file": "Every test in this file stopped running, so nothing checks that code any more.",
  "removed-tests": "Fewer tests run than before, and no new ones replace them.",
  suppressed: "The error is still there; it is only hidden from the tools that would report it.",
  skipped: "The test no longer runs (or only a few tests run), so a failure cannot turn CI red.",
  "always-passes": "This line passes whatever the code does, so it proves nothing.",
  weakened: "The old line checked one exact value. The new one passes for almost any value, so a wrong result would still go green.",
  threshold: "Less of the code has to be tested before CI goes green.",
  timeout: "A slow or hanging test now gets far more time before it fails.",
  retry: "A test that fails now and then is run again until it passes once.",
  swallowed: "The error is caught and ignored, so the caller never learns something went wrong.",
};
// Worth a look, but sometimes deliberate (a best-effort save, browser storage in private mode): shown, never blocking.
const WARN_ONLY = new Set(["swallowed"]);

function prProblems(pr, warnings) {
  const name = `PR #${pr.number}`;
  const out = [];
  const add = (kind, text) => out.push({ kind, pr: pr.number, url: pr.url, text: `${name}: ${text}` });
  const warn = (text) => warnings.push({ kind: "warning", pr: pr.number, url: pr.url, text: `${name}: ${text}` });

  if (!pr.merged) add("not-merged", "is not merged yet.");

  const ran = pr.checks.filter((c) => c.conclusion !== "skipped" && c.conclusion !== "neutral");
  const running = ran.filter((c) => RUNNING.has(c.status));
  const failed = ran.filter((c) => FAILED.has(c.conclusion));
  if (failed.length) add("check-failed", `check ${failed.map((c) => `"${c.name}"`).join(", ")} failed.`);
  else if (running.length) add("check-pending", `check ${running.map((c) => `"${c.name}"`).join(", ")} is still running.`);
  else if (!ran.length) add("no-checks", "no test run is attached (no CI check ran).");

  const code = pr.files.filter((f) => !NON_CODE.test(f) && !isTestFile(f));
  if (code.length && !pr.files.some(isTestFile)) add("no-test-change", `changes code (${code.slice(0, 3).join(", ")}) but no test.`);
  // Work whose commits credit an AI agent must prove itself with at least one new exact assertion, not just touched test files.
  if (pr.ai && code.length && !addsExactAssertion(pr.diff ?? "")) add("ai-no-assertion", `its commits credit ${pr.ai} and it adds no new exact assertion to a test.`);

  const all = findTampering(pr.diff ?? "");
  for (const f of all.filter((x) => WARN_ONLY.has(x.kind))) warn(`${f.file}${f.line ? `:${f.line}` : ""} ${DESCRIBE[f.kind]} (${f.text}).`);
  const findings = all.filter((x) => !WARN_ONLY.has(x.kind));
  if (findings.length) {
    const listed = findings.slice(0, MAX_FINDINGS).map((f) => `${f.file}${f.line ? `:${f.line}` : ""} ${DESCRIBE[f.kind]}${f.text && f.kind !== "removed-tests" ? ` (${f.text})` : ""}`);
    if (findings.length > MAX_FINDINGS) listed.push(`and ${findings.length - MAX_FINDINGS} more`);
    add("tampering", `changes that can make checks pass without fixing anything: ${listed.join("; ")}.`);
    // The panel shows each change as before → after: the moment a reviewer sees why green is not proof.
    out.at(-1).evidence = findings.slice(0, MAX_FINDINGS).map(({ file, line, kind, text, before }) => ({ file, line, kind, says: DESCRIBE[kind], why: WHY[kind], after: text, before }));
  }
  return out;
}

/** prs: [{ number, url, merged, files: [path], diff, checks: [{ name, status, conclusion }] }] */
export function verdict(prs, { skipLabel = "no-code" } = {}) {
  const warnings = [];
  const problems = prs.length
    ? prs.flatMap((pr) => prProblems(pr, warnings))
    : [{ kind: "no-pr", text: "No pull request mentions this work item. Put the key in the PR title or branch name." }];
  const heads = warnings.length ? ["Heads-up (not blocking):", ...warnings.map((w) => `• ${w.text}`)] : [];
  const message = problems.length
    ? ["Not done yet:", ...problems.map((p) => `• ${p.text}`), ...heads, `Fix these. If this work needs no code, add the label "${skipLabel}".`].join("\n")
    : ["Done: every linked PR is merged, its checks passed and its tests were kept honest.", ...heads].join("\n");
  return { done: problems.length === 0, problems, warnings, message };
}
