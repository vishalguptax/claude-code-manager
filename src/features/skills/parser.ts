/**
 * Skill parsing — reads skill folders from global and project directories,
 * parses SKILL.md frontmatter and body.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createMtimeCache } from "../../core/mtimeCache";
import { parseFrontmatter, fmString, fmList } from "../../core/frontmatter";
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
 * Read `tags` from parsed frontmatter, accepting either a YAML list
 * (`tags: [a, b]` / `tags:\n  - a`) or the comma-separated scalar
 * shorthand (`tags: a, b`) that SKILL.md files commonly use.
 */
function parseTags(fm: ReturnType<typeof parseFrontmatter>): string[] {
  const list = fmList(fm, "tags");
  if (list) return list;
  const scalar = fmString(fm, "tags");
  if (!scalar) return [];
  return scalar.split(",").map((t) => t.trim()).filter(Boolean);
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
            const fm = parseFrontmatter(raw);
            return {
              id: `${idPrefix}:${idSuffix}`,
              name: fmString(fm, "name") || entry,
              description: fmString(fm, "description") ?? "",
              scope,
              path: folderPath,
              content: raw,
              tags: parseTags(fm),
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
