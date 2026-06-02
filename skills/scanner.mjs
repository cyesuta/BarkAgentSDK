/**
 * BarkSDK — Skill scanner (replaces discover_skill_names + injectCapabilities)
 *
 * Scans project-local skill directories and returns skill names containing
 * SKILL.md. The list is injected into the developer prompt so the model
 * knows which skills are available.
 *
 * Zero overlap with NTR SDK's `discover_skill_names()` or
 * `_skill_developer_instructions()`.
 *
 * Scan order (first match wins, duplicates deduped):
 *   <cwd>/.barkide/skills/
 *   <cwd>/.agents/skills/
 *   <cwd>/.claude/skills/
 *   <cwd>/skills/
 */

import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SKILL_DIRS = [
  ".barkide/skills",
  ".agents/skills",
  ".claude/skills",
  "skills",
];

/**
 * Scan for available skill names.
 * @param {string} cwd — project working directory
 * @param {{skillDirs?: string[]}} [options]
 * @returns {string[]} — deduplicated skill names
 */
export function capabilityScanner(cwd, options = {}) {
  if (!cwd) return [];
  const skillDirs = Array.isArray(options.skillDirs) && options.skillDirs.length > 0
    ? options.skillDirs
    : DEFAULT_SKILL_DIRS;
  const names = [];
  const seen = new Set();

  for (const skillDir of skillDirs) {
    const dir = path.resolve(cwd, skillDir);
    if (!fs.existsSync(dir)) continue;
    let entries;
    try { entries = fs.readdirSync(dir); } catch { continue; }

    for (const entry of entries) {
      if (seen.has(entry)) continue;
      const skillMd = path.join(dir, entry, "SKILL.md");
      if (fs.existsSync(skillMd) && fs.statSync(skillMd).isFile()) {
        names.push(entry);
        seen.add(entry);
      }
    }
  }

  return names;
}


/**
 * Build a developer instructions string with skill names.
 * @param {string[]} names — skill names from capabilityScanner()
 * @returns {string} — prompt fragment, or empty string
 */
export function injectCapabilities(names) {
  if (!names || names.length === 0) return "";

  return (
    `You have access to the following skills: ${names.join(", ")}. ` +
    `To invoke a skill, call: Skill(name="<skill_name>").\n` +
    `Available skills:\n${names.map((n) => `  - ${n}`).join("\n")}\n`
  );
}
