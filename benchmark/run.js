// Runs the tampering rules over benchmark/cases.js and prints what was caught, missed and wrongly flagged.
import { findTampering } from "../src/lib/tamper.js";
import { cases } from "./cases.js";

// Heads-up only findings (a dropped error) never block, so they don't count as a flag here.
const BLOCKING = (f) => f.kind !== "swallowed";

const rows = cases.map((c) => {
  const kinds = findTampering(c.diff).filter(BLOCKING).map((f) => f.kind);
  const flagged = kinds.length > 0;
  const ok = (c.expect === "flag") === flagged;
  return { ...c, kinds, flagged, ok };
});

const groups = [...new Set(rows.map((r) => r.group))];
console.log("| Group | Cases | Correct |\n|---|---|---|");
for (const g of groups) {
  const rs = rows.filter((r) => r.group === g);
  console.log(`| ${g} | ${rs.length} | ${rs.filter((r) => r.ok).length} |`);
}
const tampering = rows.filter((r) => r.expect === "flag");
const honest = rows.filter((r) => r.expect === "pass");
console.log(`\nCaught ${tampering.filter((r) => r.flagged).length} of ${tampering.length} tampering cases; false alarms on ${honest.filter((r) => r.flagged).length} of ${honest.length} honest changes.`);
const wrong = rows.filter((r) => !r.ok);
if (wrong.length) {
  console.log("\nNot right:");
  for (const r of wrong) console.log(`- [${r.group}] ${r.name}: ${r.flagged ? `flagged as ${r.kinds.join(", ")}` : "missed"}`);
}
process.exitCode = wrong.length ? 1 : 0;
