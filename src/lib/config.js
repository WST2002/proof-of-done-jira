// Which GitHub repository belongs to a Jira project, and the optional token. Saved per Jira site by an admin.
// Lines look like "SHOP=acme/shop"; a line without "=" is the default repository for every other project.

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PROJECT = /^[A-Z][A-Z0-9_]+$/;

/** Parses the admin's text into { defaultRepo, projects: { KEY: "owner/name" } } and a list of problems. */
export function parseRepos(text) {
  const config = { defaultRepo: "", projects: {} };
  const problems = [];
  for (const [i, raw] of (text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [left, right] = line.includes("=") ? line.split("=").map((s) => s.trim()) : [null, line];
    // GitHub is the default; Bitbucket repositories are written bitbucket:workspace/repo (a bitbucket.org URL works too).
    const bitbucket = /^bitbucket:|^https?:\/\/bitbucket\.org\//.test(right);
    const path = right.replace(/^bitbucket:/, "").replace(/^https?:\/\/(github|bitbucket)\.(com|org)\//, "").replace(/\.git$|\/$/g, "");
    const repo = bitbucket ? `bitbucket:${path}` : path;
    if (!REPO.test(path)) problems.push(`Line ${i + 1}: "${right}" is not a repository like owner/name or bitbucket:workspace/name.`);
    else if (left === null) config.defaultRepo = repo;
    else if (!PROJECT.test(left.toUpperCase())) problems.push(`Line ${i + 1}: "${left}" is not a Jira project key like SHOP.`);
    else config.projects[left.toUpperCase()] = repo;
  }
  return { config, problems };
}

/** The text an admin sees for a saved config: the default first, then one line per project. */
export function formatRepos(config) {
  return [config?.defaultRepo, ...Object.entries(config?.projects ?? {}).map(([k, v]) => `${k}=${v}`)].filter(Boolean).join("\n");
}

/** The repository for a work item key like SHOP-12. */
export function repoFor(config, issueKey) {
  const project = String(issueKey).split("-")[0].toUpperCase();
  return config?.projects?.[project] || config?.defaultRepo || "";
}

// Work that needs no code (design, research, a meeting) carries this label and skips the check.
export const DEFAULT_SKIP_LABEL = "no-code";

/** Why a work item skips the check, or null. Labels compare without case. */
export function skipReason(labels, skipLabel) {
  if (!skipLabel) return null;
  return (labels ?? []).some((l) => l.toLowerCase() === skipLabel.toLowerCase()) ? `Skipped: this work item is labelled ${skipLabel}, so it needs no pull request.` : null;
}

/** A problem with the admin's skip label, or null. Jira labels cannot contain spaces. */
export function checkSkipLabel(label) {
  return /\s/.test(label ?? "") ? `The label "${label}" has spaces; Jira labels are single words like no-code.` : null;
}
