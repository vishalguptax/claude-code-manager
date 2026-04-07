/**
 * Skill parsing — reads skill folders from global and project directories,
 * parses SKILL.md frontmatter and body.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Skill } from "./types";

/** Global skills directory (~/.claude/skills/) */
const GLOBAL_SKILLS_DIR: string = path.join(os.homedir(), ".claude", "skills");

/**
 * Parse YAML frontmatter from a SKILL.md file content string.
 * Handles simple key-value pairs and nested metadata.tags.
 *
 * @param raw - Raw file content of SKILL.md
 * @returns Parsed frontmatter fields and markdown body
 */
function parseFrontmatter(raw: string): { name: string; description: string; tags: string[]; body: string } {
  const result = { name: "", description: "", tags: [] as string[], body: raw };

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return result;
  }

  const yaml = match[1];
  result.body = match[2];

  for (const line of yaml.split(/\r?\n/)) {
    const kvMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (key === "name") {
        result.name = value;
      } else if (key === "description") {
        result.description = value;
      } else if (key === "tags") {
        result.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
      }
    }
  }

  return result;
}

/**
 * Read all skills from a given directory.
 *
 * @param dir - Absolute path to a skills directory
 * @param scope - Whether these are "global" or "project" skills
 * @returns Array of parsed Skill objects
 */
function readSkillsFromDir(dir: string, scope: "global" | "project"): Skill[] {
  const skills: Skill[] = [];

  if (!fs.existsSync(dir)) {
    return skills;
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const folderPath = path.join(dir, entry);
    try {
      if (!fs.statSync(folderPath).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    const skillFile = path.join(folderPath, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      continue;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(skillFile, "utf-8");
    } catch {
      continue;
    }

    const parsed = parseFrontmatter(raw);

    skills.push({
      id: `${scope}:${entry}`,
      name: parsed.name || entry,
      description: parsed.description,
      scope,
      path: folderPath,
      content: raw,
      tags: parsed.tags,
    });
  }

  return skills;
}

/**
 * Parse all skills from both global (~/.claude/skills/) and project-level
 * (.claude/skills/) directories.
 *
 * @param workspacePath - Absolute path to the current VS Code workspace folder (optional)
 * @returns Array of all discovered Skill objects, project skills first
 */
export function parseSkills(workspacePath?: string): Skill[] {
  const skills: Skill[] = [];

  // Project-level skills
  if (workspacePath) {
    const projectSkillsDir = path.join(workspacePath, ".claude", "skills");
    skills.push(...readSkillsFromDir(projectSkillsDir, "project"));
  }

  // Global skills
  skills.push(...readSkillsFromDir(GLOBAL_SKILLS_DIR, "global"));

  return skills;
}
