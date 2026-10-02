/**
 * Resolving a skill the webview names by path into one the host may act on.
 *
 * The webview sends a folder path; nothing it sends is trusted. Every action
 * re-parses the skills Claude Code would load and acts only on the skill
 * whose folder is that path. Deleting additionally requires an editable
 * scope (global or project — never a plugin's or a claude.ai-synced folder)
 * and a folder strictly inside that scope's root, checked on canonical
 * paths so `..` and symlinked parents cannot reach outside it.
 *
 * Pure Node.js — no VS Code dependency.
 */
import { isStrictlyInside, removeEntry, samePath } from "../../core/pathGuard";
import { GLOBAL_SKILLS_DIR, parseSkills, projectSkillsDir } from "./parser";
import type { Skill } from "./types";

/** A resolved skill, or the user-facing reason the request was refused. */
export type SkillLookup = { ok: true; skill: Skill } | { ok: false; error: string };

/** The parsed skill whose folder is `skillPath`, of any scope. */
export function findSkill(skillPath: string, workspacePath?: string): SkillLookup {
  const skill = parseSkills(workspacePath).find((s) => samePath(s.path, skillPath));
  return skill
    ? { ok: true, skill }
    : { ok: false, error: `${skillPath} is not a skill Claude Code loads — refresh the list.` };
}

/** Resolve a skill for deletion, refusing anything outside an editable root. */
export function findDeletableSkill(skillPath: string, workspacePath?: string): SkillLookup {
  const found = findSkill(skillPath, workspacePath);
  if (!found.ok) return found;
  const { skill } = found;
  const root =
    skill.scope === "global"
      ? GLOBAL_SKILLS_DIR
      : skill.scope === "project"
        ? projectSkillsDir(workspacePath)
        : null;
  if (root === null) {
    return {
      ok: false,
      error:
        skill.scope === "claude.ai"
          ? `"${skill.name}" is synced from your claude.ai account — remove it on claude.ai.`
          : `"${skill.name}" belongs to plugin ${skill.pluginName ?? ""} — remove it with /plugin.`,
    };
  }
  if (!isStrictlyInside(skill.path, root)) {
    return { ok: false, error: `${skill.path} is outside ${root}, so it was not deleted.` };
  }
  return found;
}

/** Delete a resolved skill's folder (a symlinked folder loses only its link). */
export function deleteSkillFolder(skill: Skill): void {
  removeEntry(skill.path);
}
