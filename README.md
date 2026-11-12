# Proof of Done for Jira

A Jira work item moves to **Done** only when the work behind it is really done.

Proof of Done is a Forge app. When someone moves a work item to Done, it looks up the GitHub or Bitbucket Cloud pull requests that mention the item's key and blocks the move unless:

- every linked pull request is **merged**,
- its CI checks **ran and passed** (skipped or still-running checks don't count),
- code changes come **with test changes**,
- no test was **weakened, skipped or deleted** to get green: for example `toBe(9)` turned into `toBeDefined()`, a new `it.skip`, a test timeout doubled or more, retries added to a flaky test, or a lowered coverage threshold.
- if the pull request carries an **AI agent signal** (a `Co-Authored-By: Claude/Copilot/...` trailer or a bot author in its commits), it must add at least one new exact assertion. This reads what the commits say about themselves; it is not a guess about who wrote the code.

An error caught and dropped without handling is shown as a heads-up, not a block, because it is sometimes deliberate.

If something is missing, Jira shows exactly what, with file and line, the line before and after, and one sentence on why that change is suspicious, so the fix is obvious.

Work that needs no code (design, research, a meeting) gets the label `no-code` and moves to Done without a pull request. Admins can change that label in the settings page.

Add the **Proof of Done** condition to the same transition and Done is hidden while the last check failed; re-checking from the work item brings it back.

When the work item reaches Done, Proof of Done leaves an **audit receipt** comment: each merged pull request, its CI checks and the test-honesty result, so the evidence stays with the work item. The receipt pins the exact commit, links each CI run and names the rules version. The validator never trusts an earlier result: it checks the pull requests again at the moment someone moves the work item.

Every work item also gets a **Proof of Done** box that shows the same check before anyone tries Done: each linked pull request, its CI checks and every problem found, with a **Check again** button.

The test-tampering rules are the same ones used by [proof-of-done](https://github.com/WST2002/claude-code-skills/tree/main/plugins/proof-of-done), a Claude Code plugin that stops an AI agent from saying "done" before the tests pass ([30-second demo](https://youtube.com/shorts/ozlYRXQTs-U)).

## Ask it from an AI agent (MCP and Rovo)

Three read-only tools are available to Rovo agents and to external MCP clients such as Claude Code:

- `check-done`: is this work item really done, and if not, what is missing?
- `get-test-evidence`: every change that makes the tests prove less, with file, line, and the assertion before and after.
- `get-test-timeline`: each commit of the pull request, its CI result, and the commit where CI turned green after the tests were changed.

To use them from an external client, a site admin turns on external MCP access for Proof of Done (Atlassian Administration → Apps → Connected apps → Proof of Done → enable the tools), then the client connects to `https://mcp.atlassian.com/forge/487a9b05-d2bc-4e8f-98ce-2c533e95676f`, for example:

```bash
claude mcp add --transport http proof-of-done https://mcp.atlassian.com/forge/487a9b05-d2bc-4e8f-98ce-2c533e95676f
```

## Catch it before merge (Bitbucket)

`bitbucket-merge-check/` is a second, small Forge app for Bitbucket Cloud. It adds a **custom merge check** that runs the same test-tampering rules on every push to a pull request, so the problem shows up on the pull request itself, before anyone merges. On Bitbucket Premium the check can be made required to block the merge.

To use it: install it on your workspace, enable **Workspace settings → Custom merge checks**, then add **Proof of Done** under **Repository settings → Custom merge checks**.

## Setup

**Install from the link** (no code needed): open the installation link, choose your Jira site, then in Jira go to **Apps → Manage apps → Proof of Done** and enter the repository for each project: `owner/name` for GitHub, `bitbucket:workspace/name` for Bitbucket Cloud (and a read-only token for private repositories). Then, on the same settings page, choose a project under **Turn it on for a project**: it previews which transitions into Done get the validator and condition, and applies them when you press **Apply**.

**Or deploy your own copy** with Node.js 22 and the Forge CLI:

```bash
npm install
forge register
forge deploy
forge install
```

Pull requests are linked when the PR title or branch name contains the work item key, for example `SHOP-12: round prices`.

## Tests

```bash
npm test
```

`test/verdict.test.js`, `test/tamper.test.js` and `test/config.test.js` cover the rules and settings. `test/github.test.js` and `test/bitbucket.test.js` read real pull requests from GitHub and Bitbucket Cloud (no mocks); set `GITHUB_TOKEN` to avoid GitHub's rate limit.

## How accurate is it?

`benchmark/cases.js` holds 61 small pull-request diffs: 21 honest changes (renames, stronger assertions, moved test files, lower timeouts, small timeout bumps, runtime skips with a reason) and 40 shortcuts (20 weakened assertions across Jest, node:assert, pytest, unittest and JUnit; 10 skipped or deleted tests; 10 config or suppression tricks). `npm run benchmark` prints the result, and CI runs it on every pull request.

| | First run | Now |
|---|---|---|
| Shortcuts caught | 33 of 40 | 40 of 40 |
| Honest changes wrongly flagged | 1 of 20 | 0 of 21 |

The first run missed weakened assertions in Python, unittest and JUnit, and flagged a moved test file as deleted; those rules were fixed. The rules were also run over 68 honest merged pull requests from two other real repositories: none was blocked.

Every block names the file and line, so a person can always see why.

## Privacy

- Proof of Done stores its settings: the GitHub or Bitbucket repository for each Jira project, an optional label for work that needs no code, and optional GitHub and Bitbucket tokens, which are kept encrypted in Forge storage.
- When a work item is checked, it sends the work item key and the repository name to the GitHub or Bitbucket API, and reads pull request titles, branch names, changed files, diffs, commits and CI results. Nothing from GitHub or Bitbucket is stored, except the last check result (passed or not, and the problems found), which is saved on the work item so the Done condition can read it.
- It stores no personal data and sends nothing to any other service.

## Support

Open an issue at https://github.com/WST2002/proof-of-done-jira/issues or email tripathiwageesha2002@gmail.com.

## Terms

Proof of Done is free and open source under the MIT license, provided "as is", without warranty of any kind.

## License

MIT

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002) · [YouTube](https://www.youtube.com/@wst2002rk)
