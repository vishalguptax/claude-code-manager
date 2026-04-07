/**
 * Centralized state store for the skills webview.
 * All mutable state lives here. Other modules read via getters and
 * mutate via explicit setter functions so changes are easy to trace.
 */

import type { Skill } from "../types";

// ── Raw state ──

let allSkills: Skill[] = [];
let selectedSkill: Skill | null = null;
let searchQuery = "";
let filterScope: "all" | "project" | "global" = "all";
let skillsShellMounted = false;

// ── Getters ──

/** Return all skills (unfiltered). */
export function getAllSkills(): Skill[] {
  return allSkills;
}

/** Return the currently selected skill (if any). */
export function getSelectedSkill(): Skill | null {
  return selectedSkill;
}

/** Return the current search query (lowercase). */
export function getSkillsSearchQuery(): string {
  return searchQuery;
}

/** Return whether the skills shell DOM has been mounted. */
export function isSkillsShellMounted(): boolean {
  return skillsShellMounted;
}

// ── Setters ──

/** Replace the full skills list with newly received data. */
export function setAllSkills(skills: Skill[]): void {
  allSkills = skills;
}

/** Set the currently selected skill. */
export function setSelectedSkill(skill: Skill | null): void {
  selectedSkill = skill;
}

/** Set the search query string. */
export function setSkillsSearchQuery(q: string): void {
  searchQuery = q;
}

/** Mark the skills shell DOM as mounted. */
export function setSkillsShellMounted(v: boolean): void {
  skillsShellMounted = v;
}

/** Return the current scope filter value. */
export function getFilterScope(): "all" | "project" | "global" {
  return filterScope;
}

/** Set the scope filter value. */
export function setFilterScope(scope: "all" | "project" | "global"): void {
  filterScope = scope;
}

/** Return skills filtered by a specific scope. */
export function getSkillsByScope(scope: "global" | "project"): Skill[] {
  return allSkills.filter((s) => s.scope === scope);
}

// ── Derived data ──

/**
 * Return skills filtered by the current search query and scope filter.
 * Results are grouped with project skills before global skills.
 */
export function getFilteredSkills(): Skill[] {
  let list = allSkills;

  if (filterScope !== "all") {
    list = list.filter((s) => s.scope === filterScope);
  }

  if (searchQuery) {
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery) ||
        s.description.toLowerCase().includes(searchQuery) ||
        s.tags.some((t) => t.toLowerCase().includes(searchQuery)),
    );
  }

  // Project skills first, then global
  list.sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === "project" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return list;
}
