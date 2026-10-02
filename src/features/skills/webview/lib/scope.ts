/**
 * How a skill's source reads in the UI: which shared badge tone it borrows,
 * and why it cannot be changed from here.
 */
import type { BadgeProps } from "../../../../webview/shared/ui";
import type { Skill, SkillScope } from "../../types";

/**
 * The shared scope-badge tone for a skill scope. A claude.ai skill is not the
 * user's to edit on disk, so it takes the `builtin` tone the other tabs use
 * for "this one is not yours to edit".
 */
export function scopeTone(scope: SkillScope): NonNullable<BadgeProps["scope"]> {
  return scope === "claude.ai" ? "builtin" : scope;
}

/** Why a skill cannot be edited or deleted here, or null when it can. */
export function readOnlyReason(skill: Skill): string | null {
  if (skill.scope === "plugin") {
    return `Owned by plugin ${skill.pluginName ?? ""} — managed by Claude Code's /plugin command.`;
  }
  if (skill.scope === "claude.ai") {
    return "Synced from your claude.ai account. Edits to these files are not saved to your account and are replaced on the next sync — change it on claude.ai.";
  }
  return null;
}
