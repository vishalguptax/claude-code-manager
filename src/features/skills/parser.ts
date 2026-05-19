/**
 * Skill parsing — reads skill folders from global and project directories,
 * parses SKILL.md frontmatter and body.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createMtimeCache } from "../../core/mtimeCache";
import { loadActivePlugins, resolvePluginContentDirs, type ActivePlugin } from "../../core/plugins";
import type { Skill } from "./types";

/**
 * Cache parsed Skill objects by their SKILL.md path. The directory
 * walk stays uncached (it's cheap), but parsing the frontmatter for
 * dozens of unchanged skills on every reload was the dominant cost
 * of the Skills tab on weak machines.
 */
const skillCache = createMtimeCache<Skill>();

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

  // YAML frontmatter can use block-scalar markers (`>-`, `|-`, `>`,
  // `|`) for multi-line values. The naive regex below caught only
  // single-line key:value rows, so a real SKILL.md with
  //   description: >-
  //     Multi-line text...
  // surfaced "description = >-" and dropped the actual prose. Walk
  // line by line; when we see a block-scalar marker, collect every
  // indented follow-up line until indentation drops back.
  const lines = yaml.split(/\r?\n/);
  const assign = (key: string, value: string): void => {
    if (key === "name") result.name = value;
    else if (key === "description") result.description = value;
    else if (key === "tags") {
      result.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kvMatch = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1].trim();
    const rawValue = kvMatch[2];

    // Block scalar — consume follow-up indented lines. `>` folds
    // newlines to spaces; `|` preserves them. `-` / `+` chomp
    // trailing newlines (we trim anyway, so irrelevant).
    const scalarMatch = rawValue.match(/^([|>])([+-]?)\s*$/);
    if (scalarMatch) {
      const fold = scalarMatch[1] === ">";
      const collected: string[] = [];
      let baseIndent = -1;
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (!next.trim()) {
          collected.push("");
          j++;
          continue;
        }
        const indent = (next.match(/^(\s*)/) ?? ["", ""])[1].length;
        if (baseIndent < 0) baseIndent = indent;
        if (indent < baseIndent || indent === 0) break;
        collected.push(next.slice(baseIndent));
        j++;
      }
      i = j - 1;
      const joined = fold
        ? collected.join(" ").replace(/\s+/g, " ").trim()
        : collected.join("\n").trim();
      assign(key, joined);
      continue;
    }

    // Plain single-line value (handles empty string safely).
    assign(key, rawValue.trim());
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
interface ReadSkillsOpts {
  scope: "global" | "project" | "plugin";
  /**
   * For `scope: "plugin"`, the qualified plugin name carried onto
   * each Skill and prefixed into its ID so plugin items are
   * disambiguated from same-named global/project items.
   */
  pluginName?: string;
}

function readSkillsFromDir(root: string, opts: ReadSkillsOpts): Skill[] {
  const skills: Skill[] = [];
  if (!fs.existsSync(root)) return skills;

  const { scope, pluginName } = opts;
  // Plugin IDs are namespaced by qualified name so two plugins
  // shipping a `lint` skill don't collide on their ID.
  const idPrefix = scope === "plugin" && pluginName ? `plugin:${pluginName}` : scope;

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
        // IDs must stay unique across nested skills — include the
        // folder path segments so `team/lint` and `lint` don't
        // collide when both exist.
        const idSuffix = [...groupSegments, entry].join("/");
        let skill: Skill;
        try {
          skill = skillCache.get(skillFile, (p) => {
            const raw = fs.readFileSync(p, "utf-8");
            const parsed = parseFrontmatter(raw);
            return {
              id: `${idPrefix}:${idSuffix}`,
              name: parsed.name || entry,
              description: parsed.description,
              scope,
              path: folderPath,
              content: raw,
              tags: parsed.tags,
              group: groupSegments.join("/"),
              pluginName: scope === "plugin" ? pluginName : undefined,
            };
          });
        } catch {
          continue;
        }
        skills.push(skill);
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
    skills.push(...readSkillsFromDir(projectSkillsDir, { scope: "project" }));
  }

  // Global skills
  skills.push(...readSkillsFromDir(GLOBAL_SKILLS_DIR, { scope: "global" }));

  // Plugin-provided skills. Each active plugin may declare a custom
  // skills path (manifest.skills) or fall back to the conventional
  // `skills/` directory at its root.
  for (const plugin of loadActivePlugins(workspacePath)) {
    skills.push(...readPluginSkills(plugin));
  }

  return skills;
}

function readPluginSkills(plugin: ActivePlugin): Skill[] {
  const out: Skill[] = [];
  for (const dir of resolvePluginContentDirs(plugin, "skills", "skills")) {
    out.push(...readSkillsFromDir(dir, { scope: "plugin", pluginName: plugin.qualifiedName }));
  }
  return out;
}
