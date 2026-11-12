import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepos, formatRepos, repoFor, issueKeyOf } from "../src/lib/config.js";

test("a default repo and per-project repos are read from the admin's text", () => {
  const { config, problems } = parseRepos("acme/shop\nPAY = acme/payments\nweb=https://github.com/acme/website.git\n# a comment\n");
  assert.deepEqual(problems, []);
  assert.deepEqual(config, { defaultRepo: "acme/shop", projects: { PAY: "acme/payments", WEB: "acme/website" } });
});

test("each work item uses its project's repo, or the default", () => {
  const config = { defaultRepo: "acme/shop", projects: { PAY: "acme/payments" } };
  assert.equal(repoFor(config, "PAY-12"), "acme/payments");
  assert.equal(repoFor(config, "SHOP-3"), "acme/shop");
  assert.equal(repoFor({ projects: {} }, "SHOP-3"), "");
});

test("bad lines are reported with their line number", () => {
  const { problems } = parseRepos("acme/shop\nPAY=not a repo\n1X=acme/x");
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Line 2/);
  assert.match(problems[1], /Line 3/);
});

test("the saved config is shown back the same way", () => {
  const text = "acme/shop\nPAY=acme/payments";
  assert.equal(formatRepos(parseRepos(text).config), text);
});

test("a work item with the skip label needs no pull request", async () => {
  const { skipReason, DEFAULT_SKIP_LABEL } = await import("../src/lib/config.js");
  assert.equal(DEFAULT_SKIP_LABEL, "no-code");
  assert.match(skipReason(["design", "No-Code"], "no-code"), /labelled no-code/);
  assert.equal(skipReason(["design"], "no-code"), null);
  assert.equal(skipReason([], ""), null);
});

test("the skip label must be a single Jira label", async () => {
  const { checkSkipLabel } = await import("../src/lib/config.js");
  assert.equal(checkSkipLabel("no-code"), null);
  assert.equal(checkSkipLabel(""), null);
  assert.match(checkSkipLabel("no code"), /spaces/);
});

test("Bitbucket repositories are read as bitbucket:workspace/repo", () => {
  const { config, problems } = parseRepos("acme/shop\nSHOP=bitbucket:wst2002rk/shop-demo\nWEB=https://bitbucket.org/acme/website/");
  assert.deepEqual(problems, []);
  assert.equal(config.projects.SHOP, "bitbucket:wst2002rk/shop-demo");
  assert.equal(config.projects.WEB, "bitbucket:acme/website");
  assert.equal(formatRepos(config), "acme/shop\nSHOP=bitbucket:wst2002rk/shop-demo\nWEB=bitbucket:acme/website");
});

test("an MCP or Rovo caller's key is trimmed and upper-cased", () => {
  assert.equal(issueKeyOf({ issueKey: " pod-6 " }), "POD-6");
  assert.equal(issueKeyOf({ context: { jira: { issueKey: "SHOP-2" } } }), "SHOP-2");
  assert.equal(issueKeyOf({}), "");
});
