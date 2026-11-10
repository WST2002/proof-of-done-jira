// Decides whether a Jira work item may move to Done, from the pull requests linked to it.
// A PR counts only when it is merged, its checks ran and passed, code changes come with test changes,
// and no test was weakened, skipped or deleted to get there.
import { findTampering, isTestFile } from "./tamper.js";

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
};

function prProblems(pr) {
  const name = `PR #${pr.number}`;
  const out = [];
  const add = (kind, text) => out.push({ kind, pr: pr.number, url: pr.url, text: `${name}: ${text}` });

  if (!pr.merged) add("not-merged", "is not merged yet.");

  const ran = pr.checks.filter((c) => c.conclusion !== "skipped" && c.conclusion !== "neutral");
  const running = ran.filter((c) => RUNNING.has(c.status));
  const failed = ran.filter((c) => FAILED.has(c.conclusion));
  if (failed.length) add("check-failed", `check ${failed.map((c) => `"${c.name}"`).join(", ")} failed.`);
  else if (running.length) add("check-pending", `check ${running.map((c) => `"${c.name}"`).join(", ")} is still running.`);
  else if (!ran.length) add("no-checks", "no test run is attached (no CI check ran).");

  const code = pr.files.filter((f) => !NON_CODE.test(f) && !isTestFile(f));
  if (code.length && !pr.files.some(isTestFile)) add("no-test-change", `changes code (${code.slice(0, 3).join(", ")}) but no test.`);

  const findings = findTampering(pr.diff ?? "");
  if (findings.length) {
    const listed = findings.slice(0, MAX_FINDINGS).map((f) => `${f.file}${f.line ? `:${f.line}` : ""} ${DESCRIBE[f.kind]}${f.text && f.kind !== "removed-tests" ? ` (${f.text})` : ""}`);
    if (findings.length > MAX_FINDINGS) listed.push(`and ${findings.length - MAX_FINDINGS} more`);
    add("tampering", `changes that can make checks pass without fixing anything: ${listed.join("; ")}.`);
  }
  return out;
}

/** prs: [{ number, url, merged, files: [path], diff, checks: [{ name, status, conclusion }] }] */
export function verdict(prs, { skipLabel = "no-code" } = {}) {
  const problems = prs.length
    ? prs.flatMap(prProblems)
    : [{ kind: "no-pr", text: "No pull request mentions this work item. Put the key in the PR title or branch name." }];
  const message = problems.length
    ? ["Not done yet:", ...problems.map((p) => `• ${p.text}`), `Fix these. If this work needs no code, add the label "${skipLabel}".`].join("\n")
    : "Done: every linked PR is merged, its checks passed and its tests were kept honest.";
  return { done: problems.length === 0, problems, message };
}
