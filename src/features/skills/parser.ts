/**
 * Skill parsing — reads skill folders from the project, global, claude.ai
 * synced and plugin sources, parses SKILL.md frontmatter and body.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { activeSyncedDir, SYNCED_DIR_NAME, syncedDirName } from "../../core/claudeAiSync";
import { CLAUDE_DIR, projectClaudeDir } from "../../core/config";
import { asObject, readJsonObject } from "../../core/jsonFile";
import { managedOnce } from "../../core/managedSettings";
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
export const GLOBAL_SKILLS_DIR: string = path.join(CLAUDE_DIR, "skills");

/**
 * Entries of the global skills dir that Claude Code owns rather than loads
 * as user skills: `synced/` holds every claude.ai account's synced skills
 * (read separately, active account only — see claudeAiSync.ts), and
 * `.trash/` is where synced skills go once sync is turned off. Walking them
 * listed each synced skill once per account as an editable user skill.
 */
const RESERVED_GLOBAL_ENTRIES = new Set([SYNCED_DIR_NAME, ".trash"]);

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
  /** Top-level entries of `root` that are not skill folders. */
  skip?: ReadonlySet<string>;
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
      if (depth === 0 && opts.skip?.has(entry)) continue;
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
 * Read a claude.ai bucket's skills. Claude Code loads exactly the skills its
 * `manifest.json` lists (`{ skills: [{ name, skillId, description, … }] }`),
 * each from `<bucket>/<dir name>/SKILL.md` (see `syncedDirName`); folders the manifest does not list
 * (a `.staging` dir, a skill mid-download) are not loaded.
 */
function readSyncedSkills(bucket: string): Skill[] {
  const res = readJsonObject(path.join(bucket, "manifest.json"));
  const rows = res.kind === "ok" && Array.isArray(res.data.skills) ? res.data.skills : [];
  const skills: Skill[] = [];
  for (const row of rows) {
    const name = asObject(row)?.name;
    if (typeof name !== "string") continue;
    const dirName = syncedDirName(name);
    if (dirName === null) continue;
    const folderPath = path.join(bucket, dirName);
    const skillFile = path.join(folderPath, "SKILL.md");
    try {
      skills.push(
        skillCache.get(skillFile, (p) => {
          const raw = fs.readFileSync(p, "utf-8");
          const fm = parseFrontmatter(raw);
          return {
            id: `claude.ai:${name}`,
            name: fmString(fm, "name") || name,
            description: fmString(fm, "description") ?? "",
            scope: "claude.ai",
            path: folderPath,
            content: raw,
            tags: parseTags(fm),
            group: "",
          };
        }),
      );
    } catch {
      // Listed but not on disk yet — the next sync round fills it in.
    }
  }
  return skills;
}

/** The workspace's own `.claude/skills`, or null when it has no project dir. */
export function projectSkillsDir(workspacePath?: string): string | null {
  const projectDir = workspacePath ? projectClaudeDir(workspacePath) : null;
  return projectDir === null ? null : path.join(projectDir, "skills");
}

/**
 * Parse all skills Claude Code would load: project-level (`.claude/skills/`
 * of the workspace, when it has its own), global (`~/.claude/skills/`),
 * synced from the active claude.ai account, and plugin-provided.
 *
 * @param workspacePath - Absolute path to the current VS Code workspace folder (optional)
 * @returns Array of all discovered Skill objects, project skills first
 */
export function parseSkills(workspacePath?: string): Skill[] {
  const skills: Skill[] = [];

  // Project-level skills. None when the workspace is the home folder: its
  // .claude/skills IS the global dir, and reading it twice listed every
  // user skill again as "project".
  const projectSkills = projectSkillsDir(workspacePath);
  if (projectSkills) {
    skills.push(...readSkillsFromDir(projectSkills, { scope: "project" }));
  }

  // Global skills
  skills.push(
    ...readSkillsFromDir(GLOBAL_SKILLS_DIR, { scope: "global", skip: RESERVED_GLOBAL_ENTRIES }),
  );

  // Skills synced from the signed-in claude.ai account.
  // One policy read for the whole pass (synced skills + synced plugins), and
  // none at all when nothing synced is on disk.
  const managed = managedOnce();
  const bucket = activeSyncedDir(path.join(GLOBAL_SKILLS_DIR, SYNCED_DIR_NAME), "skills", managed);
  if (bucket) skills.push(...readSyncedSkills(bucket));

  // Plugin-provided skills. Each active plugin may declare a custom
  // skills path (manifest.skills) or fall back to the conventional
  // `skills/` directory at its root.
  for (const plugin of loadActivePlugins(workspacePath, managed)) {
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
