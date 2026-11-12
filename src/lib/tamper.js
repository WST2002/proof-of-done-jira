// Finds test changes that make a check pass without fixing anything, in a unified diff. Same rules as proof-of-done (github.com/WST2002/claude-code-skills).

const TEST_FILE = [
  /(^|\/)(tests?|__tests__|spec)\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.(py|go)$/,
  /Tests?\.(java|kt|cs)$/,
];
// A whole test turned off. A skip inside a test with a reason (t.skip("no clipboard here")) is an environment guard, not tampering.
const SKIP = /\b(?:it|test|describe|context|suite|specify)\.(?:skip|only|todo)\s*\(|\b(?:xit|xdescribe|xtest|fit|fdescribe)\s*\(|@pytest\.mark\.(?:skip|skipif|xfail)\b|@unittest\.skip|#\[ignore\]|@Disabled\b|@Ignore\b/;
const ALWAYS_PASSES = /expect\(\s*(true|1)\s*\)\.(toBe|toEqual)\(\s*(true|1)\s*\)|\bassert\s+True\b|assert\.ok\(\s*true\s*\)|assertTrue\(\s*true\s*\)|\bassert\(\s*true\s*\)/;
const WEAK = /\.(toBeTruthy|toBeDefined|toBeFalsy)\(\s*\)|\bassert\.ok\(|\bassert\(\s*[\w.]+\s*\)|\.not\.toBeNull\(\s*\)|\.not\.toBeUndefined\(\s*\)|toBeGreaterThanOrEqual\(\s*0\s*\)|\bassert\s+[^=!<>]+?(\s+is\s+not\s+None)?\s*$|\bself\.assert(True|IsNotNone)\(|\bassertNotNull\(|\bassertTrue\(.*!=\s*null\s*\)/;
const STRONG = /\.(toBe|toEqual|toStrictEqual|toMatch|toContain|toHaveLength|toThrow|toHaveBeenCalledWith)\(\s*\S|\bassert\w*\s*\(?.*(==|!=|Equal|In\b)|\bassert\.(equal|deepEqual|strictEqual|deepStrictEqual|match|throws)\(/;
const TEST_CASE = /^\s*(it|test|describe|xit|fit|xdescribe|fdescribe)(\.\w+)*\s*\(|^\s*(async\s+)?def\s+test_|^\s*func\s+Test\w*\(|@Test\b/;
const SUPPRESS = /@ts-(ignore|nocheck)\b|eslint-disable|#\s*noqa\b|#\s*type:\s*ignore|\/\/\s*nolint\b|@SuppressWarnings\b|#\s*pragma:\s*no cover/;
const THRESHOLD = /\b(branches|functions|lines|statements|fail_under|fail-under|cov-fail-under)["']?\s*[:=]?\s*(\d+(?:\.\d+)?)/;
const NON_CODE = /\.(md|mdx|txt|rst|lock)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
// Test runner config files: timeouts and retries set there hide slow or flaky tests just like in a test file.
const TEST_CONFIG = /(^|\/)(jest|vitest|playwright|cypress|karma|mocha)\.config\.[cm]?[jt]s$|(^|\/)\.mocharc\.|(^|\/)(pytest\.ini|setup\.cfg|tox\.ini|pyproject\.toml)$/;
// A timeout value, so a raised one can be compared with the one it replaced. A small bump is normal tuning; doubling it or more hides a slow test.
const TIMEOUTS = [
  /\b(?:jest\.setTimeout|this\.timeout|test\.setTimeout|setDefaultTimeout)\(\s*(\d+)/,
  /\b(?:testTimeout|timeout|defaultTimeout)["']?\s*[:=]\s*(\d+)/,
  /@pytest\.mark\.timeout\(\s*(\d+)/,
  /^\s*\}\s*,\s*(\d{3,})\s*\)\s*;?\s*$/,
];
// Retries make a flaky test pass on a later try.
const RETRY = /\bjest\.retryTimes\(\s*[1-9]|\bthis\.retries\(\s*[1-9]|@pytest\.mark\.flaky\b|--reruns\b|\bretries["']?\s*[:=]\s*[1-9]/;
// An error caught and dropped: an empty catch, or one that only returns an empty value.
const SWALLOW = /\bcatch\s*(\([^)]*\))?\s*\{\s*(return\s*(\[\s*\]|\{\s*\}|null|undefined|false|""|0)?\s*;?)?\s*\}|\.catch\(\s*(\(\s*\w*\s*\)|\w+)\s*=>\s*(\{\s*\}|null|undefined|\[\s*\])\s*\)|^\s*except\b[^:]*:\s*pass\s*$/;
const PY_EXCEPT = /^\s*except\b[^:]*:\s*$/;

export const isTestFile = (file) => TEST_FILE.some((re) => re.test(file));

/** Files in a unified diff, each with its hunks and whether it was created or deleted. */
export function parseDiff(diff) {
  const files = [];
  let file = null;
  let line = 0;
  let hunk = null;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = { path: raw.replace(/^diff --git a\/.* b\//, ""), created: false, deleted: false, hunks: [] };
      files.push(file);
      hunk = null;
    } else if (!file) continue;
    else if (raw.startsWith("new file mode")) file.created = true;
    else if (raw.startsWith("deleted file mode")) file.deleted = true;
    else if (raw.startsWith("+++ ") && raw !== "+++ /dev/null") file.path = raw.slice(4).replace(/^b\//, "");
    else if (raw.startsWith("@@")) {
      line = Number(/\+(\d+)/.exec(raw)?.[1] ?? 0);
      hunk = { added: [], removed: [] };
      file.hunks.push(hunk);
    } else if (hunk && raw.startsWith("+") && !raw.startsWith("+++")) hunk.added.push({ line: line++, text: raw.slice(1) });
    else if (hunk && raw.startsWith("-") && !raw.startsWith("---")) hunk.removed.push({ text: raw.slice(1) });
    else if (hunk && raw.startsWith(" ")) line++;
  }
  return files;
}

// Words inside string literals (a test name, an example) are not code: blank them before matching.
// Regex literals too: a "/" that follows an operator or bracket and is not a comment starts one.
const withoutStrings = (text) =>
  text
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
    .replace(/(^|[=(,:!&|?{};]\s*)\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[a-z]*/g, "$1/x/");

// What a weak assertion checks: expect(X).toBeDefined() -> X, assert.ok(X) / assert(X) -> X, Python assert X -> X.
function subject(text) {
  const jest = /expect\(\s*(.+?)\s*\)\s*\.(?:not\.)?to/.exec(text);
  if (jest) return jest[1].trim();
  // assert.ok(x) / assertTrue(x) / assertNotNull(x) / Python assert x: the first name the assertion looks at.
  const call = /\b(?:assert|self\.assert|assert)\w*(?:\.ok)?\(\s*(?:await\s+)?([\w.]+)/.exec(text) ?? /\bassert\s+(?:await\s+)?([\w.]+)/.exec(text);
  return call?.[1];
}

// A weak assertion is a weakening only when it replaces an exact assertion about the same thing in this hunk.
// Returns the exact assertion it replaced, so the change can be shown as before → after.
const replacedStrong = (text, removed) => {
  const what = subject(text);
  return what ? removed.find((r) => STRONG.test(r.text) && r.text.includes(what)) : undefined;
};

const short = (text) => {
  const t = text.trim();
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
};

const testCases = (lines) => lines.filter((l) => TEST_CASE.test(l.text)).length;
const movedTests = (gone, files) => {
  const before = testCases(gone.hunks.flatMap((h) => h.removed));
  const after = files.filter((f) => f.created && isTestFile(f.path)).reduce((n, f) => n + testCases(f.hunks.flatMap((h) => h.added)), 0);
  return before > 0 && after >= before;
};

/** Test-weakening changes in a diff: [{ file, line, kind, text }]. `ignore(file)` leaves a file out. */
export function findTampering(diff, ignore = () => false) {
  const findings = [];
  const files = parseDiff(diff);
  for (const file of files) {
    if (ignore(file.path) || NON_CODE.test(file.path)) continue;
    const test = isTestFile(file.path);
    if (file.deleted) {
      // A test file deleted while the same number of tests appears in a new test file is a move, not a deletion.
      if (test && !movedTests(file, files)) findings.push({ file: file.path, line: null, kind: "deleted-file", text: "" });
      continue;
    }
    let removedCases = 0;
    let addedCases = 0;
    for (const { added, removed } of file.hunks) {
      for (const { line, text } of added) {
        const add = (kind, before) => findings.push({ file: file.path, line, kind, text: short(text), ...(before ? { before: short(before) } : {}) });
        const code = withoutStrings(text);
        if (SUPPRESS.test(code)) add("suppressed");
        else if (test && SKIP.test(code)) add("skipped", removed.find((r) => TEST_CASE.test(r.text))?.text);
        else if (test && ALWAYS_PASSES.test(code)) add("always-passes");
        else if (test && WEAK.test(code) && replacedStrong(text, removed)) add("weakened", replacedStrong(text, removed).text);
        if (test || TEST_CONFIG.test(file.path)) {
          if (RETRY.test(code)) add("retry");
          for (const re of TIMEOUTS) {
            const now = re.exec(code)?.[1];
            const was = removed.map((r) => re.exec(withoutStrings(r.text))?.[1]).find(Boolean);
            if (now && was && Number(now) >= 2 * Number(was)) { add("timeout", removed.find((r) => re.exec(withoutStrings(r.text)))?.text); break; }
          }
        } else if (SWALLOW.test(code) || (PY_EXCEPT.test(code) && /^\s*pass\s*$/.test(added[added.findIndex((a) => a.line === line) + 1]?.text ?? ""))) add("swallowed");
        const before = removed.map((r) => THRESHOLD.exec(r.text)).find((m) => m && m[1] === THRESHOLD.exec(text)?.[1]);
        const after = THRESHOLD.exec(text);
        if (before && after && Number(after[2]) < Number(before[2])) add("threshold");
      }
      if (test) {
        removedCases += removed.filter((r) => TEST_CASE.test(r.text)).length;
        addedCases += added.filter((a) => TEST_CASE.test(a.text)).length;
      }
    }
    if (removedCases > addedCases) findings.push({ file: file.path, line: null, kind: "removed-tests", text: String(removedCases - addedCases) });
  }
  return findings;
}
