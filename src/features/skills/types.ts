/**
 * Type definitions for the skills feature.
 * Covers skill data, scope, and message protocol.
 */

// ── Skill Data ──

/** A parsed Claude Code skill with metadata from SKILL.md frontmatter. */
export interface Skill {
  /** Unique identifier derived from scope + folder name */
  id: string;
  /** Human-readable skill name from frontmatter */
  name: string;
  /** Short description from frontmatter */
  description: string;
  /** Whether the skill is global (~/.claude/skills/) or project-level (.claude/skills/) */
  scope: "global" | "project";
  /** Absolute path to the skill folder */
  path: string;
  /** Full raw content of SKILL.md (frontmatter + body) */
  content: string;
  /** Tags parsed from metadata.tags in frontmatter */
  tags: string[];
  /**
   * Folder path between the skills root and this skill's folder,
   * joined with "/". Empty string for top-level skills. Example:
   * "team/lint" for `~/.claude/skills/team/lint/SKILL.md`. Used by
   * the webview to group skills under collapsible folder headers.
   */
  group: string;
}

// ── Extension <-> Webview Messages ──

/** Messages sent from the extension host to the webview for skills. */
export type SkillsExtensionMessage =
  | { type: "skills"; data: Skill[] }
  | { type: "skillDetail"; data: Skill };

/** Messages sent from the webview to the extension host for skills. */
export type SkillsWebviewMessage =
  | { type: "getSkills" }
  | { type: "getSkillDetail"; skillId: string }
  | { type: "openSkillFile"; skillPath: string };
