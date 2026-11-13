// Forge entry points. The workflow validator, the Rovo agent action and the work item panel all share one check.
import api, { route } from "@forge/api";
import { kvs } from "@forge/kvs";
import resolverModule from "@forge/resolver";
import { linkedPullRequests, githubCommitHistory, pullMentions } from "./lib/github.js";
import { linkedBitbucketPullRequests, bitbucketCommitHistory, bitbucketPullMentions } from "./lib/bitbucket.js";
import { buildTimeline } from "./lib/timeline.js";
import { planSetup } from "./lib/setup.js";
import { verdict } from "./lib/verdict.js";
import { receipt, afterDoneNote, overrideNote } from "./lib/receipt.js";
import { overrideFor, checkReason } from "./lib/override.js";
import { checkRecord } from "./lib/record.js";
import { summarize, byProject } from "./lib/dashboard.js";
import { fixTask, pickIssueType } from "./lib/fixtask.js";
import { parseRepos, formatRepos, repoFor, skipReason, checkSkipLabel, DEFAULT_SKIP_LABEL, issueKeyOf, hostOf, adminOnly } from "./lib/config.js";

const CONFIG = "config";
const TOKEN = "github-token";
const BB_TOKEN = "bitbucket-token";
const OVERRIDE = "proof-of-done-override";
const FIX = "proof-of-done-fix";

async function settings() {
  const saved = (await kvs.get(CONFIG)) ?? {};
  const config = saved.defaultRepo || Object.keys(saved.projects ?? {}).length ? saved : { defaultRepo: process.env.GITHUB_REPO ?? "", projects: {} };
  const token = (await kvs.getSecret(TOKEN)) || process.env.GITHUB_TOKEN;
  const skipLabel = saved.skipLabel ?? DEFAULT_SKIP_LABEL;
  const bitbucketToken = await kvs.getSecret(BB_TOKEN);
  return { config, token, bitbucketToken, skipLabel };
}

// A Jira REST call as the app or as the person using the page; throws Jira's own message on failure.
async function jiraAs(as, path, init) {
  const res = await api[as]().requestJira(path, { headers: { Accept: "application/json", "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.errorMessages?.[0] ?? Object.values(body.errors ?? {})[0] ?? `Jira ${res.status}`);
  return body;
}

async function labelsOf(key) {
  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}?fields=labels`, { headers: { Accept: "application/json" } });
  return res.ok ? (await res.json()).fields?.labels ?? [] : [];
}

// The result is saved on the work item, so a workflow condition can hide Done while the last check failed,
// and the project dashboard can list every block, catch and override.
async function remember(key, v) {
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/proof-of-done`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(checkRecord(v)),
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
  if (!repo) return { done: false, repo, prs: [], problems: [], message: "Proof of Done is not set up for this project yet: a Jira admin can add the GitHub or Bitbucket repository under Jira settings → Apps → Proof of Done settings." };
  try {
    const prs = repo.startsWith("bitbucket:")
      ? await linkedBitbucketPullRequests({ fetch: api.fetch, token: bitbucketToken, repo: repo.slice("bitbucket:".length), key })
      : await linkedPullRequests({ fetch: api.fetch, token, repo, key });
    const v = { ...verdict(prs, { skipLabel }), repo, prs: prs.map(({ number, url, merged, checks, files, ai, sha }) => ({ number, url, merged, checks, files: files.length, ai, sha })) };
    if (v.done) return v;
    // A project admin's recorded override lets this work item through, but only for the commits it was given for.
    const saved = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/${OVERRIDE}`, { headers: { Accept: "application/json" } });
    const overridden = saved.ok ? overrideFor((await saved.json()).value, v.prs) : null;
    return overridden ? { ...v, done: true, overridden, message: `Done by a recorded override. Reason: ${overridden.reason}` } : v;
  } catch (e) {
    return { done: false, repo, prs: [], problems: [], message: `Could not check ${hostOf(repo)}, so Done is blocked for now: ${e.message}` };
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
  // One receipt per checked state: a repeated event for the same commits does not post it twice.
  const stamp = `receipt:${v.done}:${(v.prs ?? []).map((p) => p.sha).join(",")}`;
  const seen = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/proof-of-done-receipt`, { headers: { Accept: "application/json" } });
  if (seen.ok && (await seen.json()).value?.stamp === stamp) return;
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/proof-of-done-receipt`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stamp }) });
  // If the work changed between the move and this check, say so on the work item instead of staying silent.
  const body = v.done ? receipt(v) : afterDoneNote(v);
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ body }),
  });
}

// Rovo and MCP callers see only work items their own Jira permissions allow, and a typo gets a clear answer.
async function unseen(key) {
  if (!key) return "Tell me which work item to check, for example SHOP-12.";
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${key}?fields=summary`, { headers: { Accept: "application/json" } });
  return res.ok ? null : { issueKey: key, found: false, message: `${key} was not found, or you do not have permission to see it.` };
}

export async function checkDone(payload) {
  const key = issueKeyOf(payload);
  const missing = await unseen(key);
  if (missing) return missing;
  const v = await check(key);
  return { issueKey: key, done: v.done, message: v.message, problems: v.problems, pullRequests: v.prs };
}

// Rovo / MCP: every change that makes the tests prove less, as before → after.
export async function getTestEvidence(payload) {
  const key = issueKeyOf(payload);
  const missing = await unseen(key);
  if (missing) return missing;
  const v = await check(key);
  const evidence = (v.problems ?? []).flatMap((p) => (p.evidence ?? []).map((e) => ({ pr: p.pr, ...e })));
  return { issueKey: key, done: v.done, summary: evidence.length ? `${evidence.length} change(s) make the tests prove less.` : v.message, evidence, headsUp: (v.warnings ?? []).map((w) => w.text) };
}

// Rovo / MCP: commit by commit, and where CI turned green after the tests were changed.
export async function getTestTimeline(payload) {
  const key = issueKeyOf(payload);
  const missing = await unseen(key);
  if (missing) return missing;
  const { config, token, bitbucketToken } = await settings();
  const repo = repoFor(config, key);
  if (!repo) return { issueKey: key, message: "Proof of Done is not set up for this project yet." };
  try {
    return { issueKey: key, ...(await timelinesFor(repo, key, token, bitbucketToken)) };
  } catch (e) {
    return { issueKey: key, available: false, message: `Could not read ${hostOf(repo)}: ${e.message}` };
  }
}

async function timelinesFor(repo, key, token, bitbucketToken) {
  const prs = repo.startsWith("bitbucket:")
    ? await linkedBitbucketPullRequests({ fetch: api.fetch, token: bitbucketToken, repo: repo.slice("bitbucket:".length), key })
    : await linkedPullRequests({ fetch: api.fetch, token, repo, key });
  if (!prs.length) return { message: "No pull request mentions this work item yet." };
  const timelines = [];
  for (const pr of prs) {
    const commits = repo.startsWith("bitbucket:")
      ? await bitbucketCommitHistory({ fetch: api.fetch, token: bitbucketToken, repo: repo.slice("bitbucket:".length), number: pr.number })
      : await githubCommitHistory({ fetch: api.fetch, token, repo, number: pr.number });
    const t = buildTimeline(commits);
    timelines.push({ pr: pr.number, url: pr.url, greenAfterTestChange: t.greenAfterTampering, commits: t.entries.map((e) => ({ commit: e.short, title: e.title, ci: e.ci, testChanges: e.findings.map((f) => `${f.file}${f.line ? `:${f.line}` : ""} ${f.says}`), note: e.note })) });
  }
  return { timelines };
}

// @forge/resolver is CommonJS; in an ES module its class arrives as .default.
const Resolver = resolverModule.default ?? resolverModule;
const resolver = new Resolver();

// Settings and workflow changes: refused unless the call comes from the admin page.
const admin = (fn) => async (req) => {
  const refused = adminOnly(req.context);
  return refused ? { ok: false, message: refused } : fn(req);
};

resolver.define("check", async ({ context }) => check(context.extension.issue.key));

// A project admin lets a blocked work item through, with a reason that is saved and posted on the work item.
resolver.define("override", async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const bad = checkReason(payload.reason);
  if (bad) return { ok: false, message: bad };
  const project = key.split("-")[0];
  // A project admin, or a Jira admin (who can administer every project but often holds no project role).
  const perm = await api.asUser().requestJira(route`/rest/api/3/mypermissions?projectKey=${project}&permissions=ADMINISTER_PROJECTS,ADMINISTER`, { headers: { Accept: "application/json" } });
  const granted = perm.ok ? (await perm.json()).permissions ?? {} : {};
  if (!granted.ADMINISTER_PROJECTS?.havePermission && !granted.ADMINISTER?.havePermission) return { ok: false, message: `Only a Jira admin or an admin of project ${project} can override Proof of Done.` };
  const v = await evaluate(key);
  if (v.done) return { ok: false, message: "Nothing to override: the check passes." };
  if (!v.prs.length) return { ok: false, message: "Nothing to override: no pull request is linked. Use the no-code label for work without code." };
  const saved = { accountId: context.accountId, at: new Date().toISOString(), reason: String(payload.reason).trim(), shas: v.prs.map((p) => p.sha) };
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/${OVERRIDE}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saved) });
  await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ body: overrideNote(saved, v) }),
  });
  return { ok: true, result: await check(key) };
});

// Turns a block into the next piece of work: a task (a sub-task when the project has one) with the evidence in it.
// Created as the person who pressed the button, so Jira's own permissions apply; one task per blocked state.
resolver.define("fixTask", async ({ context }) => {
  const key = context.extension.issue.key;
  const v = await evaluate(key);
  if (v.done) return { ok: false, message: "Nothing to fix: the check passes." };
  if (!v.prs.length) return { ok: false, message: "No pull request is linked yet, so there is nothing to fix in code." };
  const shas = v.prs.map((p) => p.sha).join(",");
  const prev = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/${FIX}`, { headers: { Accept: "application/json" } });
  const last = prev.ok ? (await prev.json()).value : null;
  if (last?.shas === shas && last.key) {
    const still = await api.asUser().requestJira(route`/rest/api/3/issue/${last.key}?fields=summary`, { headers: { Accept: "application/json" } });
    if (still.ok) return { ok: true, key: last.key, existing: true };
  }
  try {
    const me = await jiraAs("asUser", route`/rest/api/3/issue/${key}?fields=issuetype,project`);
    const project = me.fields.project.key;
    const meta = await jiraAs("asUser", route`/rest/api/3/issue/createmeta/${project}/issuetypes?maxResults=50`);
    const type = pickIssueType(meta.issueTypes ?? meta.values ?? [], { parentIsSubtask: Boolean(me.fields.issuetype?.subtask) });
    if (!type) return { ok: false, message: `Project ${project} has no work type a task can be created with.` };
    const { summary, description } = fixTask(key, v);
    const fields = { project: { key: project }, issuetype: { id: type.id }, summary, description, ...(type.subtask ? { parent: { key } } : {}) };
    const created = await jiraAs("asUser", route`/rest/api/3/issue`, { method: "POST", body: JSON.stringify({ fields }) });
    // A Task (not a sub-task) is linked as blocking the work item, so both show the connection.
    if (!type.subtask) await jiraAs("asUser", route`/rest/api/3/issueLink`, { method: "POST", body: JSON.stringify({ type: { name: "Blocks" }, inwardIssue: { key }, outwardIssue: { key: created.key } }) }).catch(() => {});
    await api.asApp().requestJira(route`/rest/api/3/issue/${key}/properties/${FIX}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: created.key, shas }) });
    return { ok: true, key: created.key, subtask: type.subtask };
  } catch (e) {
    return { ok: false, message: `The task was not created: ${e.message}` };
  }
});

// The project dashboard and the settings page read the saved check of the most recently updated work items.
// The search runs as the viewer, so nobody sees a work item Jira would hide from them.
const PROPERTIES = ["proof-of-done", OVERRIDE];
async function recentIssues(as, jql) {
  const res = await jiraAs(as, route`/rest/api/3/search/jql`, { method: "POST", body: JSON.stringify({ jql, maxResults: 100, fields: ["summary", "status"], properties: PROPERTIES }) });
  return (res.issues ?? []).map((i) => ({
    key: i.key,
    summary: i.fields?.summary ?? "",
    status: i.fields?.status?.name ?? "",
    statusCategory: i.fields?.status?.statusCategory?.key ?? "",
    record: i.properties?.["proof-of-done"] ?? null,
    override: i.properties?.[OVERRIDE] ?? null,
  }));
}

resolver.define("dashboard", async ({ context }) => {
  const project = context.extension?.project?.key;
  if (!project) return { ok: false, message: "Open this page from a Jira project." };
  try {
    const issues = await recentIssues("asUser", `project = "${project}" ORDER BY updated DESC`);
    const { config } = await settings();
    return { ok: true, project, repo: repoFor(config, `${project}-1`), shown: issues.length, ...summarize(issues) };
  } catch (e) {
    return { ok: false, message: `Could not read the work items: ${e.message}` };
  }
});

// Commit by commit: what each push did to the tests, and where CI turned green. Loaded on request (more API calls).
resolver.define("timeline", async ({ payload, context }) => {
  const { config, token, bitbucketToken } = await settings();
  const key = context.extension.issue.key;
  const repo = repoFor(config, key);
  try {
    // Only a pull request that belongs to this work item: never someone else's PR by number.
    const belongs = repo.startsWith("bitbucket:")
      ? await bitbucketPullMentions({ fetch: api.fetch, token: bitbucketToken, repo: repo.slice("bitbucket:".length), number: payload.number, key })
      : await pullMentions({ fetch: api.fetch, token, repo, number: payload.number, key });
    if (!belongs) return { ok: false, message: `Pull request #${payload.number} does not mention ${key}.` };
    const commits = repo.startsWith("bitbucket:")
      ? await bitbucketCommitHistory({ fetch: api.fetch, token: bitbucketToken, repo: repo.slice("bitbucket:".length), number: payload.number })
      : await githubCommitHistory({ fetch: api.fetch, token, repo, number: payload.number });
    return { ok: true, ...buildTimeline(commits) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

resolver.define("overview", admin(async () => {
  try {
    return { ok: true, projects: byProject(await recentIssues("asApp", "updated >= -30d ORDER BY updated DESC")) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}));

resolver.define("getSettings", admin(async () => {
  const { config, skipLabel } = await settings();
  return { repos: formatRepos(config), skipLabel, hasToken: Boolean(await kvs.getSecret(TOKEN)), hasBitbucketToken: Boolean(await kvs.getSecret(BB_TOKEN)) };
}));

resolver.define("saveSettings", admin(async ({ payload }) => {
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
}));

// --- guided setup: preview, then apply, the validator and condition on a project's transitions into Done ---------
const jira = (path, init) => jiraAs("asApp", path, init);

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

resolver.define("projects", admin(async () => {
  const res = await jira(route`/rest/api/3/project/search?maxResults=50`);
  return (res.values ?? []).map((p) => ({ key: p.key, name: p.name, teamManaged: p.style === "next-gen" }));
}));

resolver.define("previewSetup", admin(async ({ payload }) => {
  try {
    const { project, teamManaged, plans } = await projectPlans(payload.projectKey);
    return { ok: true, project, teamManaged, plans: plans.map(({ workflow, changes, alreadyDone }) => ({ workflow, changes, alreadyDone })) };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}));

resolver.define("applySetup", admin(async ({ payload }) => {
  try {
    const { plans } = await projectPlans(payload.projectKey);
    for (const plan of plans.filter((p) => !p.alreadyDone)) await jira(route`/rest/api/3/workflows/update`, { method: "POST", body: JSON.stringify(plan.update) });
    return { ok: true, applied: plans.filter((p) => !p.alreadyDone).length };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}));

export const handler = resolver.getDefinitions();
