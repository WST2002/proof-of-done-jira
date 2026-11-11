# Proof of Done for Jira

A Jira work item moves to **Done** only when the work behind it is really done.

Proof of Done is a Forge app. When someone moves a work item to Done, it looks up the GitHub or Bitbucket Cloud pull requests that mention the item's key and blocks the move unless:

- every linked pull request is **merged**,
- its CI checks **ran and passed** (skipped or still-running checks don't count),
- code changes come **with test changes**,
- no test was **weakened, skipped or deleted** to get green: for example `toBe(9)` turned into `toBeDefined()`, a new `it.skip`, a raised test timeout, retries added to a flaky test, or a lowered coverage threshold.
- if the pull request was **written with an AI agent** (a `Co-Authored-By: Claude/Copilot/...` trailer or a bot author), it must add at least one new exact assertion.

An error caught and dropped without handling is shown as a heads-up, not a block, because it is sometimes deliberate.

If something is missing, Jira shows exactly what, with file and line, so the fix is obvious.

Work that needs no code (design, research, a meeting) gets the label `no-code` and moves to Done without a pull request. Admins can change that label in the settings page.

Add the **Proof of Done** condition to the same transition and Done is hidden while the last check failed; re-checking from the work item brings it back.

When the work item reaches Done, Proof of Done leaves a **receipt** comment: each merged pull request, its CI checks and the test-honesty result, so the evidence stays with the work item.

Every work item also gets a **Proof of Done** box that shows the same check before anyone tries Done: each linked pull request, its CI checks and every problem found, with a **Check again** button.

The test-tampering rules are the same ones used by [proof-of-done](https://github.com/WST2002/claude-code-skills/tree/main/plugins/proof-of-done), a Claude Code plugin that stops an AI agent from saying "done" before the tests pass ([30-second demo](https://youtube.com/shorts/ozlYRXQTs-U)).

## Catch it before merge (Bitbucket)

`bitbucket-merge-check/` is a second, small Forge app for Bitbucket Cloud. It adds a **custom merge check** that runs the same test-tampering rules on every push to a pull request, so the problem shows up on the pull request itself, before anyone merges. On Bitbucket Premium the check can be made required to block the merge.

To use it: install it on your workspace, enable **Workspace settings → Custom merge checks**, then add **Proof of Done** under **Repository settings → Custom merge checks**.

## Setup

**Install from the link** (no code needed): open the installation link, choose your Jira site, then in Jira go to **Apps → Manage apps → Proof of Done** and enter the repository for each project: `owner/name` for GitHub, `bitbucket:workspace/name` for Bitbucket Cloud (and a read-only token for private repositories). Then add the **Proof of Done** validator to the transition into Done.

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

## Privacy

- Proof of Done stores only its settings: the GitHub repository for each Jira project, and an optional GitHub token, which is kept encrypted in Forge storage.
- When a work item is checked, it sends the work item key and the repository name to the GitHub API, and reads pull request titles, branch names, changed files, diffs and CI check results. Nothing from GitHub is stored.
- It stores no personal data and sends nothing to any other service.

## Support

Open an issue at https://github.com/WST2002/proof-of-done-jira/issues or email tripathiwageesha2002@gmail.com.

## Terms

Proof of Done is free and open source under the MIT license, provided "as is", without warranty of any kind.

## License

MIT

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002) · [YouTube](https://www.youtube.com/@wst2002rk)
