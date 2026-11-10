# Proof of Done for Jira

A Jira work item moves to **Done** only when the work behind it is really done.

Proof of Done is a Forge app. When someone moves a work item to Done, it looks up the GitHub pull requests that mention the item's key and blocks the move unless:

- every linked pull request is **merged**,
- its CI checks **ran and passed** (skipped or still-running checks don't count),
- code changes come **with test changes**,
- no test was **weakened, skipped or deleted** to get green: for example `toBe(9)` turned into `toBeDefined()`, a new `it.skip`, or a lowered coverage threshold.

If something is missing, Jira shows exactly what, with file and line, so the fix is obvious.

It also adds a **Rovo agent**: ask "Is SHOP-12 really done?" and it runs the same check and explains the answer.

The test-tampering rules are the same ones used by [proof-of-done](https://github.com/WST2002/claude-code-skills/tree/main/plugins/proof-of-done), a Claude Code plugin that stops an AI agent from saying "done" before the tests pass ([30-second demo](https://youtube.com/shorts/ozlYRXQTs-U)).

## Setup

Requires Node.js 22 and the Forge CLI.

```bash
npm install
forge register
forge variables set GITHUB_REPO owner/name
forge variables set --encrypt GITHUB_TOKEN <token>   # only for private repos
forge deploy
forge install
```

Then add the **Proof of Done** validator to the transition into Done in your Jira workflow.

Pull requests are linked when the PR title or branch name contains the work item key, for example `SHOP-12: round prices`.

## Tests

```bash
npm test
```

`test/verdict.test.js` covers the rules. `test/github.test.js` reads a real public pull request from GitHub (no mocks).

## License

MIT

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002) · [YouTube](https://www.youtube.com/@wst2002rk)
