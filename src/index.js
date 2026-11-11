// Forge entry points. The workflow validator, the Rovo agent action and the work item panel all share one check.
import api, { route } from "@forge/api";
import { kvs } from "@forge/kvs";
import resolverModule from "@forge/resolver";
import { linkedPullRequests } from "./lib/github.js";
import { verdict } from "./lib/verdict.js";
import { parseRepos, formatRepos, repoFor, skipReason, checkSkipLabel, DEFAULT_SKIP_LABEL } from "./lib/config.js";

const CONFIG = "config";
const TOKEN = "github-token";

async function settings() {
  const saved = (await kvs.get(CONFIG)) ?? {};
  const config = saved.defaultRepo || Object.keys(saved.projects ?? {}).length ? saved : { defaultRepo: process.env.GITHUB_REPO ?? "", projects: {} };
  const token = (await kvs.getSecret(TOKEN)) || process.env.GITHUB_TOKEN;
  const skipLabel = saved.skipLabel ?? DEFAULT_SKIP_LABEL;
  return { config, token, skipLabel };
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
  return remember(key, await evaluate(key));
}

async function evaluate(key) {
  const { config, token, skipLabel } = await settings();
  const skipped = skipReason(await labelsOf(key), skipLabel);
  if (skipped) return { done: true, skipped: true, repo: "", prs: [], problems: [], message: skipped };
  const repo = repoFor(config, key);
  if (!repo) return { done: false, repo, prs: [], problems: [], message: "Proof of Done is not set up for this project yet: a Jira admin can add the GitHub repository under Apps → Proof of Done." };
  try {
    const prs = await linkedPullRequests({ fetch: api.fetch, token, repo, key });
    return { ...verdict(prs, { skipLabel }), repo, prs: prs.map(({ number, url, merged, checks, files }) => ({ number, url, merged, checks, files: files.length })) };
  } catch (e) {
    return { done: false, repo, prs: [], problems: [], message: `Could not check GitHub, so Done is blocked for now: ${e.message}` };
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
  return { issueKey: key, done: v.done, message: v.message, problems: v.problems, pullRequests: v.prs };
}

// @forge/resolver is CommonJS; in an ES module its class arrives as .default.
const Resolver = resolverModule.default ?? resolverModule;
const resolver = new Resolver();

resolver.define("check", async ({ context }) => check(context.extension.issue.key));

resolver.define("getSettings", async () => {
  const { config, skipLabel } = await settings();
  return { repos: formatRepos(config), skipLabel, hasToken: Boolean(await kvs.getSecret(TOKEN)) };
});

resolver.define("saveSettings", async ({ payload }) => {
  const { config, problems } = parseRepos(payload.repos);
  const labelProblem = checkSkipLabel(payload.skipLabel);
  if (labelProblem) problems.push(labelProblem);
  if (problems.length) return { ok: false, problems };
  await kvs.set(CONFIG, { ...config, skipLabel: (payload.skipLabel ?? "").trim() });
  if (payload.clearToken) await kvs.deleteSecret(TOKEN);
  else if (payload.token?.trim()) await kvs.setSecret(TOKEN, payload.token.trim());
  return { ok: true, problems: [], hasToken: Boolean(await kvs.getSecret(TOKEN)) };
});

export const handler = resolver.getDefinitions();
