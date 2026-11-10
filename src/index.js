// Forge entry points: the Jira workflow validator and the Rovo agent action share one check.
import api from "@forge/api";
import { linkedPullRequests } from "./lib/github.js";
import { verdict } from "./lib/verdict.js";

// Set with: forge variables set GITHUB_REPO owner/name  and  forge variables set --encrypt GITHUB_TOKEN <token>
async function check(key) {
  const repo = process.env.GITHUB_REPO;
  if (!repo) return { done: false, message: "Proof of Done is not set up: an admin must set GITHUB_REPO (owner/name)." };
  try {
    const prs = await linkedPullRequests({ fetch: api.fetch, token: process.env.GITHUB_TOKEN, repo, key });
    return verdict(prs);
  } catch (e) {
    return { done: false, message: `Could not check GitHub, so Done is blocked for now: ${e.message}` };
  }
}

export async function validate({ issue }) {
  const v = await check(issue.key);
  return { result: v.done, errorMessage: v.message };
}

export async function checkDone(payload) {
  const key = payload.issueKey || payload.context?.jira?.issueKey;
  if (!key) return "Tell me which work item to check, for example SHOP-12.";
  const v = await check(key);
  return { issueKey: key, done: v.done, message: v.message, problems: v.problems ?? [] };
}
