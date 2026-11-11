// Tells whether a pull request was written with an AI agent, from its commits, and whether it adds a real test.
import { parseDiff, isTestFile } from "./tamper.js";

const AGENTS = ["Claude", "Copilot", "Cursor", "Codex", "Devin", "Gemini", "Aider", "OpenHands", "Kiro", "Amazon Q", "Windsurf", "ChatGPT"];
const NAMED = new RegExp(String.raw`\b(${AGENTS.map((a) => a.replace(/ /g, String.raw`\s+`)).join("|")})\b`, "i");
const TRAILER = /^(co-authored-by:.*|generated (with|by) .*)$/gim;
const BOT = /^(copilot|devin|claude|cursor|codex|openhands|kiro)[\w-]*(\[bot\])?$/i;
const EXACT = /\.(toBe|toEqual|toStrictEqual|toMatch|toContain|toHaveLength|toThrow|toHaveBeenCalledWith)\(\s*\S|\bassert\.(equal|deepEqual|strictEqual|deepStrictEqual|match|throws|rejects)\(|\bassert\w*\s*\(?.*(==|!=|Equal)|\bassertEquals?\(/;

const canonical = (name) => AGENTS.find((a) => a.toLowerCase() === name.toLowerCase().replace(/\s+/g, " ")) ?? name;

/** The AI agent named in commit trailers or as the commit author, or null. commits: [{ message, author }] */
export function detectAI(commits) {
  for (const { message = "", author = "" } of commits) {
    for (const line of message.match(TRAILER) ?? []) {
      const m = NAMED.exec(line);
      if (m) return canonical(m[1]);
    }
    if (BOT.test(author)) return canonical(NAMED.exec(author)?.[1] ?? author);
  }
  return null;
}

/** Whether the diff adds at least one exact assertion to a test file. */
export function addsExactAssertion(diff) {
  return parseDiff(diff).some((f) => isTestFile(f.path) && f.hunks.some((h) => h.added.some((a) => EXACT.test(a.text))));
}
