/**
 * Reactive feature state for the skills webview. Replaces the vanilla
 * getter/setter store with @preact/signals. Views read `.value` and
 * re-render automatically; the message bus and event handlers write.
 */
import { computed, signal } from "@preact/signals";
import type { Skill } from "../types";

export type ScopeFilter = "all" | "project" | "global" | "plugin";

/** Default marketplace URL, mirrored from the host's `claudeManager.marketplaceSkillsUrl` setting. */
const DEFAULT_SKILLS_URL = "https://github.com/anthropics/claude-code/wiki/Skills";

/** Full skill list as last received from the host. */
export const skills = signal<Skill[]>([]);

/** Currently selected skill, or null when viewing the list. */
export const selectedSkill = signal<Skill | null>(null);

/** Lowercased search query. */
export const searchQuery = signal<string>("");

/** Active scope filter. */
export const scopeFilter = signal<ScopeFilter>("all");

/**
 * Whether the official Claude Code extension is installed. Sourced from
 * the host `settings` message; gates the "Open in Chat" / launch-in-chat
 * affordances. Mirrors the old shared `extensionStatus` flag but kept in
 * the feature so the webview is self-contained.
 */
export const claudeCodeInstalled = signal<boolean>(false);

/** Marketplace URL for the "Browse community skills" button. */
export const marketplaceSkillsUrl = signal<string>(DEFAULT_SKILLS_URL);

/** Count of skills in a given scope. */
export function countByScope(scope: Skill["scope"]): number {
  return skills.value.filter((s) => s.scope === scope).length;
}

/** Apply the search query to a single skill. */
function matchesQuery(skill: Skill, query: string): boolean {
  return (
    skill.name.toLowerCase().includes(query) ||
    skill.description.toLowerCase().includes(query) ||
    skill.tags.some((t) => t.toLowerCase().includes(query))
  );
}

/** Scope display priority: project, then global, then plugin. */
const SCOPE_ORDER: Record<Skill["scope"], number> = { project: 0, global: 1, plugin: 2 };

/**
 * Skills filtered by the active scope + search query and sorted with
 * project skills first, then global, then plugin (grouped by plugin name).
 */
export const filteredSkills = computed<Skill[]>(() => {
  const query = searchQuery.value;
  const scope = scopeFilter.value;
  let list = skills.value;

  if (scope !== "all") {
    list = list.filter((s) => s.scope === scope);
  }
  if (query) {
    list = list.filter((s) => matchesQuery(s, query));
  }

  return [...list].sort((a, b) => {
    if (a.scope !== b.scope) return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    if (a.scope === "plugin" && a.pluginName !== b.pluginName) {
      return (a.pluginName ?? "").localeCompare(b.pluginName ?? "");
    }
    return a.name.localeCompare(b.name);
  });
});
