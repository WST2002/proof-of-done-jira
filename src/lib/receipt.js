// The comment Proof of Done leaves on a work item when it moves to Done: the evidence behind "done", kept for good.
const para = (...content) => ({ type: "paragraph", content });
const txt = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });
const link = (text, href) => txt(text, [{ type: "link", attrs: { href } }]);
const bold = (text) => txt(text, [{ type: "strong" }]);
const item = (...content) => ({ type: "listItem", content: [para(...content)] });

const checkText = (c) => `${c.name}: ${c.conclusion === "success" ? "passed" : c.conclusion ?? c.status}`;
const when = (d) => d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Atlassian Document Format comment for a passed check `v` (from check()). */
export function receipt(v, at = new Date()) {
  const content = [para(bold("✅ Proof of Done receipt"), txt(` · moved to Done on ${when(at)}`))];
  if (v.skipped) {
    content.push(para(txt(v.message)));
  } else {
    content.push({
      type: "bulletList",
      content: v.prs.map((pr) => item(
        link(`PR #${pr.number}`, pr.url),
        txt(` merged · ${pr.files} file${pr.files === 1 ? "" : "s"} · `),
        txt(pr.checks.length ? pr.checks.map(checkText).join(", ") : "no CI checks"),
        ...(pr.ai ? [txt(` · written with ${pr.ai}, with a new exact assertion`)] : []),
      )),
    });
    content.push(para(txt("No test was weakened, skipped or deleted, and code changes came with test changes.")));
  }
  if (v.warnings?.length) content.push(para(bold("Heads-up: "), txt(v.warnings.map((w) => w.text).join(" "))));
  content.push(para(txt("Checked by Proof of Done.", [{ type: "em" }])));
  return { type: "doc", version: 1, content };
}
