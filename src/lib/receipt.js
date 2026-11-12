// The comment Proof of Done leaves on a work item when it moves to Done: the evidence behind "done", kept for good.
const para = (...content) => ({ type: "paragraph", content });
const txt = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });
const link = (text, href) => txt(text, [{ type: "link", attrs: { href } }]);
const bold = (text) => txt(text, [{ type: "strong" }]);
const item = (...content) => ({ type: "listItem", content: [para(...content)] });

const checkText = (c) => `${c.name}: ${c.conclusion === "success" ? "passed" : c.conclusion ?? c.status}`;
const checkNode = (c) => (c.url ? link(checkText(c), c.url) : txt(checkText(c)));
// Bumped when the rules change, so a receipt says which rules judged it.
export const RULES_VERSION = "rules v2";
const when = (d) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Atlassian Document Format comment for a passed check `v` (from check()). */
export function receipt(v, at = new Date()) {
  const content = [para(bold("✅ Proof of Done audit receipt"), txt(` · moved to Done on ${when(at)}`))];
  if (v.skipped) {
    content.push(para(txt(v.message)));
  } else {
    content.push({
      type: "bulletList",
      content: v.prs.map((pr) => item(
        link(`PR #${pr.number}`, pr.url),
        txt(` merged${pr.sha ? ` at commit ${pr.sha.slice(0, 7)}` : ""} · ${pr.files} file${pr.files === 1 ? "" : "s"} · `),
        ...(pr.checks.length ? pr.checks.flatMap((c, i) => (i ? [txt(", "), checkNode(c)] : [checkNode(c)])) : [txt("no CI checks")]),
        ...(pr.ai ? [txt(` · commits credit ${pr.ai}, and it adds a new exact assertion`)] : []),
      )),
    });
    content.push(para(txt("No test was weakened, skipped or deleted, and code changes came with test changes.")));
  }
  if (v.warnings?.length) content.push(para(bold("Heads-up: "), txt(v.warnings.map((w) => w.text).join(" "))));
  content.push(para(txt(`Checked by Proof of Done (${RULES_VERSION}).`, [{ type: "em" }])));
  return { type: "doc", version: 1, content };
}
