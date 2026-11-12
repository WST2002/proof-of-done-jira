// Forge entry points. The workflow validator, the Rovo agent action and the work item panel all share one check.
import api, { route } from "@forge/api";
import { kvs } from "@forge/kvs";
import resolverModule from "@forge/resolver";
import { linkedPullRequests, githubCommitHistory } from "./lib/github.js";
import { linkedBitbucketPullRequests, bitbucketCommitHistory } from "./lib/bitbucket.js";
import { buildTimeline } from "./lib/timeline.js";
import { planSetup } from "./lib/setup.js";
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

// Commit by commit: what each push did to the tests, and where CI turned green. Loaded on request (more API calls).
resolver.define("timeline", async ({ payload, context }) => {
  const { config, token, bitbucketToken } = await settings();
  const repo = repoFor(config, context.extension.issue.key);
  try {
    const commits = repo.startsWith("bitbucket:")
      ? await bitbucketCommitHistory({ fetch: api.fetch, token: bitbucketToken, repo: repo.slice("bitbucket:".length), number: payload.number })
      : await githubCommitHistory({ fetch: api.fetch, token, repo, number: payload.number });
    return { ok: true, ...buildTimeline(commits) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

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

// --- guided setup: preview, then apply, the validator and condition on a project's transitions into Done ---------
const jira = async (path, init) => {
  const res = await api.asApp().requestJira(path, { headers: { Accept: "application/json", "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.errorMessages?.[0] ?? `Jira ${res.status}`);
  return body;
};

async function projectPlans(projectKey) {
  const project = await jira(route`/rest/api/3/project/${projectKey}`);
  if (project.style === "next-gen") return { project: project.name, teamManaged: true, plans: [] };
  const schemes = await jira(route`/rest/api/3/workflowscheme/project?projectId=${project.id}`);
  const scheme = schemes.values?.[0]?.workflowScheme;
  const names = [...new Set([scheme?.defaultWorkflow, ...Object.values(scheme?.issueTypeMappings ?? {})].filter(Boolean))];
  const read = await jira(route`/rest/api/3/workflows?expand=values.transitions`, { method: "POST", body: JSON.stringify({ workflowNames: names }) });
  const plans = [];
  for (const workflow of read.workflows ?? []) {
    const caps = await jira(route`/rest/api/3/workflows/capabilities?workflowId=${workflow.id}`);
    const mine = (type, key) => (caps.forgeRules ?? []).find((r) => r.ruleType === type && r.id?.endsWith(`/static/${key}`));
    const validator = mine("Validator", "proof-of-done-validator");
    const condition = mine("Condition", "proof-of-done-condition");
    if (validator && condition) plans.push(planSetup({ workflow, statuses: read.statuses, validator, condition }));
  }
  return { project: project.name, teamManaged: false, plans };
}

resolver.define("projects", async () => {
  const res = await jira(route`/rest/api/3/project/search?maxResults=50`);
  return (res.values ?? []).map((p) => ({ key: p.key, name: p.name, teamManaged: p.style === "next-gen" }));
});

resolver.define("previewSetup", async ({ payload }) => {
  try {
    const { project, teamManaged, plans } = await projectPlans(payload.projectKey);
    return { ok: true, project, teamManaged, plans: plans.map(({ workflow, changes, alreadyDone }) => ({ workflow, changes, alreadyDone })) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

resolver.define("applySetup", async ({ payload }) => {
  try {
    const { plans } = await projectPlans(payload.projectKey);
    for (const plan of plans.filter((p) => !p.alreadyDone)) await jira(route`/rest/api/3/workflows/update`, { method: "POST", body: JSON.stringify(plan.update) });
    return { ok: true, applied: plans.filter((p) => !p.alreadyDone).length };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

export const handler = resolver.getDefinitions();
