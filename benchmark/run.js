// Runs the tampering rules over the benchmark and the held-out sets, and prints what was caught, missed and wrongly flagged.
import { findTampering } from "../src/lib/tamper.js";
import { cases } from "./cases.js";
import { heldOut, heldOut2 } from "./held-out.js";

// Heads-up only findings (a dropped error) never block, so they don't count as a flag here.
const BLOCKING = (f) => f.kind !== "swallowed";

const score = (set) =>
  set.map((c) => {
    const kinds = findTampering(c.diff).filter(BLOCKING).map((f) => f.kind);
    const flagged = kinds.length > 0;
    return { ...c, kinds, flagged, ok: (c.expect === "flag") === flagged };
  });

const rows = [...score(cases), ...score(heldOut), ...score(heldOut2)];

const groups = [...new Set(rows.map((r) => r.group))];
console.log("| Group | Cases | Correct |\n|---|---|---|");
for (const g of groups) {
  const rs = rows.filter((r) => r.group === g);
  console.log(`| ${g} | ${rs.length} | ${rs.filter((r) => r.ok).length} |`);
}
const tampering = rows.filter((r) => r.expect === "flag");
const honest = rows.filter((r) => r.expect === "pass");
const caught = tampering.filter((r) => r.flagged).length;
const falseAlarms = honest.filter((r) => r.flagged).length;
const pct = (n) => `${Math.round(n * 1000) / 10}%`;
console.log(`\nCaught ${caught} of ${tampering.length} tampering cases; false alarms on ${falseAlarms} of ${honest.length} honest changes.`);
console.log(`Precision ${pct(caught / (caught + falseAlarms))} (blocks that were right), recall ${pct(caught / tampering.length)} (tricks caught).`);
const wrong = rows.filter((r) => !r.ok);
if (wrong.length) {
  console.log("\nNot right:");
  for (const r of wrong) console.log(`- [${r.group}] ${r.name}: ${r.flagged ? `flagged as ${r.kinds.join(", ")}` : "missed"}`);
}
process.exitCode = wrong.length ? 1 : 0;
