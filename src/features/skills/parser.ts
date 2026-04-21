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
 * Max recursion depth for the skills walk. Prevents symlink loops +
 * accidental runaway scans in deeply-nested dotfile repos. Real-world
 * skill trees are 2–3 levels deep (e.g. `team/lint/SKILL.md`), so 6
 * is a generous safety ceiling.
 */
const MAX_SKILLS_DEPTH = 6;

/**
 * Recursively discover skill folders under `root`. A directory is a
 * skill if it contains SKILL.md; if it doesn't, we descend into its
 * subdirectories to find nested skills. This matches real team usage
 * like `~/.claude/skills/team/lint/SKILL.md` or
 * `.claude/skills/product/research/SKILL.md` — the flat-list
 * assumption previously dropped everything below the first level.
 *
 * The path from `root` to the skill folder becomes the skill's
 * `group` (folder segments joined by `/`) so the UI can render a
 * grouped/nested tree without re-deriving it later.
 */
function readSkillsFromDir(root: string, scope: "global" | "project"): Skill[] {
  const skills: Skill[] = [];
  if (!fs.existsSync(root)) return skills;

  const walk = (dir: string, groupSegments: string[], depth: number): void => {
    if (depth > MAX_SKILLS_DEPTH) return;

    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const folderPath = path.join(dir, entry);
      try {
        if (!fs.statSync(folderPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const skillFile = path.join(folderPath, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        let raw: string;
        try {
          raw = fs.readFileSync(skillFile, "utf-8");
        } catch {
          continue;
        }
        const parsed = parseFrontmatter(raw);
        // IDs must stay unique across nested skills — include the
        // folder path segments so `team/lint` and `lint` don't
        // collide when both exist. scope:segment1/segment2/name.
        const idSuffix = [...groupSegments, entry].join("/");
        skills.push({
          id: `${scope}:${idSuffix}`,
          name: parsed.name || entry,
          description: parsed.description,
          scope,
          path: folderPath,
          content: raw,
          tags: parsed.tags,
          group: groupSegments.join("/"),
        });
      } else {
        // Not a skill folder — descend. A dir with SKILL.md is a
        // leaf: we don't also walk its children so that bundled
        // resources (e.g. `examples/`) don't get mistaken for
        // sub-skills.
        walk(folderPath, [...groupSegments, entry], depth + 1);
      }
    }
  };

  walk(root, [], 0);
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
