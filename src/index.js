// Forge entry points. The workflow validator, the Rovo agent action and the work item panel all share one check.
import api, { route } from "@forge/api";
import { kvs } from "@forge/kvs";
import resolverModule from "@forge/resolver";
import { linkedPullRequests } from "./lib/github.js";
import { linkedBitbucketPullRequests } from "./lib/bitbucket.js";
import { verdict } from "./lib/verdict.js";
import { receipt } from "./lib/receipt.js";
import { parseRepos, formatRepos, repoFor, skipReason, checkSkipLabel, DEFAULT_SKIP_LABEL } from "./lib/config.js";

const CONFIG = "config";
const TOKEN = "github-token";
const BB_TOKEN = "bitbucket-token";

async function settings() {
  const saved = (await kvs.get(CONFIG)) ?? {};
  const config = saved.defaultRepo || Object.keys(saved.projects ?? {}).length ? saved : { defaultRepo: process.env.GITHUB_REPO ?? "", projects: {} };
  const token = (await kvs.getSecret(TOKEN)) || process.env.GITHUB_TOKEN;
  const skipLabel = saved.skipLabel ?? DEFAULT_SKIP_LABEL;
  const bitbucketToken = await kvs.getSecret(BB_TOKEN);
  return { config, token, bitbucketToken, skipLabel };
}

async function labelsOf(key) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}?fields=labels`, { headers: { Accept: "application/json" } });
  return res.ok ? (await res.json()).fields?.labels ?? [] : [];
}

// The result is saved on the work item, so a workflow condition can hide Done while the last check failed.
async function remember(key, v) {
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/proof-of-done`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passed: v.done, problems: (v.problems ?? []).length, checkedAt: new Date().toISOString() }),
  }).catch(() => {});
  return v;
}

async function check(key) {
  return remember(key, { ...(await evaluate(key)), checkedAt: new Date().toISOString() });
}

async function evaluate(key) {
  const { config, token, bitbucketToken, skipLabel } = await settings();
  const skipped = skipReason(await labelsOf(key), skipLabel);
  if (skipped) return { done: true, skipped: true, repo: "", prs: [], problems: [], message: skipped };
  const repo = repoFor(config, key);
  if (!repo) return { done: false, repo, prs: [], problems: [], message: "Proof of Done is not set up for this project yet: a Jira admin can add the GitHub repository under Apps → Proof of Done." };
  try {
    const prs = repo.startsWith("bitbucket:")
      ? await linkedBitbucketPullRequests({ fetch: api.fetch, token: bitbucketToken, repo: repo.slice("bitbucket:".length), key })
      : await linkedPullRequests({ fetch: api.fetch, token, repo, key });
    return { ...verdict(prs, { skipLabel }), repo, prs: prs.map(({ number, url, merged, checks, files, ai, sha }) => ({ number, url, merged, checks, files: files.length, ai, sha })) };
  } catch (e) {
    return { done: false, repo, prs: [], problems: [], message: `Could not check GitHub, so Done is blocked for now: ${e.message}` };
  }
}

export async function validate({ issue }) {
  const v = await check(issue.key);
  return { result: v.done, errorMessage: v.message };
}

// When a work item moves to Done, leave the evidence behind "done" as a comment, so it stays with the work item.
export async function onIssueUpdated(event) {
  const moved = (event?.changelog?.items ?? []).find((i) => i.field === "status");
  const key = event?.issue?.key;
  const toDone = event.issue.fields?.status?.statusCategory?.key === "done" || /^done$/i.test(moved?.toString ?? "");
  if (!key || !moved || !toDone) return;
  const v = await check(key);
  if (!v.done) return;
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ body: receipt(v) }),
  });
}

export async function checkDone(payload) {
  const key = payload.issueKey || payload.context?.jira?.issueKey;
  if (!key) return "Tell me which work item to check, for example SHOP-12.";
  const v = await check(key);
  return { issueKey: key, done: v.done, message: v.message, problems: v.problems, pullRequests: v.prs };
}

// @forge/resolver is CommonJS; in an ES module its class arrives as .default.
const Resolver = resolverModule.default ?? resolverModule;
const resolver = new Resolver();

resolver.define("check", async ({ context }) => check(context.extension.issue.key));

resolver.define("getSettings", async () => {
  const { config, skipLabel } = await settings();
  return { repos: formatRepos(config), skipLabel, hasToken: Boolean(await kvs.getSecret(TOKEN)), hasBitbucketToken: Boolean(await kvs.getSecret(BB_TOKEN)) };
});

resolver.define("saveSettings", async ({ payload }) => {
  const { config, problems } = parseRepos(payload.repos);
  const labelProblem = checkSkipLabel(payload.skipLabel);
  if (labelProblem) problems.push(labelProblem);
  if (problems.length) return { ok: false, problems };
  await kvs.set(CONFIG, { ...config, skipLabel: (payload.skipLabel ?? "").trim() });
  if (payload.clearToken) await kvs.deleteSecret(TOKEN);
  else if (payload.token?.trim()) await kvs.setSecret(TOKEN, payload.token.trim());
  if (payload.clearBitbucketToken) await kvs.deleteSecret(BB_TOKEN);
  else if (payload.bitbucketToken?.trim()) await kvs.setSecret(BB_TOKEN, payload.bitbucketToken.trim());
  return { ok: true, problems: [], hasToken: Boolean(await kvs.getSecret(TOKEN)), hasBitbucketToken: Boolean(await kvs.getSecret(BB_TOKEN)) };
});

export const handler = resolver.getDefinitions();
