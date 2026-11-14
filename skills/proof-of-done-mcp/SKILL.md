---
name: proof-of-done-mcp
description: Use when someone asks whether a Jira work item is really done, what blocks it from Done, how a test was changed, or which commit made CI green. Calls the Proof of Done MCP tools (check-done, get-test-evidence, get-test-timeline) and answers only from what they return.
---

# Is this Jira work item really done?

Proof of Done for Jira checks the pull requests behind a work item: merged, CI really passed, and no test was weakened, skipped or deleted to get green. This skill tells an AI agent how to ask it through MCP.

## Connect

Server: `https://mcp.atlassian.com/forge/487a9b05-d2bc-4e8f-98ce-2c533e95676f` (a site admin enables it under Atlassian Administration → your site → Connected apps → Proof of Done for Jira → Tools). For example, in Claude Code:

```bash
claude mcp add --transport http proof-of-done https://mcp.atlassian.com/forge/487a9b05-d2bc-4e8f-98ce-2c533e95676f
```

Sign in when asked. Every answer uses the signed-in person's Jira permissions.

## Which tool

| The person asks | Call |
|---|---|
| "Is SHOP-12 done?", "Can I close SHOP-12?", "What is blocking SHOP-12?" | `check-done` with `issueKey` |
| "How was the test changed?", "Show me the evidence" | `get-test-evidence` with `issueKey` |
| "Which commit made CI green?", "When did the tests change?" | `get-test-timeline` with `issueKey` |

Ask for the work item key (like `SHOP-12`) if it is missing. Never guess one.

## How to answer

1. Lead with the verdict in one line: done, or not done.
2. If not done, list each problem with the pull request, the file and line, the assertion before and after, and what to fix. Quote the tool's words for the evidence.
3. If the tool says the key was not found, say so plainly. The work item may not exist or the person may not be allowed to see it.
4. Never say a work item is done unless `check-done` returned `done: true`. A green CI run alone is not proof.
5. If the result is "Done by a recorded override", say that it was overridden, by whom (if given) and the reason.
6. Work that needs no code (design, research, a meeting) gets the project's no-code label on the Jira work item, not on the pull request.

## Example

> Is DEMO-2 really done?

Call `check-done` with `DEMO-2`, then `get-test-evidence` with `DEMO-2`:

> DEMO-2 is not done. In PR #2, `test/cart.test.js` line 19 replaced an exact assertion with a weaker one:
> before `assert.equal(roundPrice(10.456), 10.46);`, after `assert.ok(roundPrice(10.456));`.
> The new line passes for almost any value, so a wrong price would still turn CI green. Restore the exact assertion.

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002)
