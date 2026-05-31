/**
 * Pure grouping logic for the skills list. Splits a flat, already-sorted
 * skill array into scope buckets (Project / Global / per-plugin), and
 * within each bucket separates top-level skills from nested folder groups.
 * Extracted from the view so it can be unit-tested without a DOM.
 */
import type { Skill } from "../../types";

/** A scope bucket: top-level skills plus nested folder groups. */
export interface ScopeBucket {
  /** Heading label, e.g. "Project", "Global", "Plugin: caveman@caveman". */
  label: string;
  /** Skills directly under the scope root (group === ""). */
  top: Skill[];
  /** Nested folder groups, sorted alphabetically by folder path. */
  nested: { folder: string; skills: Skill[] }[];
}

/** Human-readable scope heading for a skill. */
function scopeLabel(skill: Skill): string {
  if (skill.scope === "project") return "Project";
  if (skill.scope === "plugin") return `Plugin: ${skill.pluginName ?? "unknown"}`;
  return "Global";
}

/**
 * Group skills by scope, then by folder. Insertion order of scope buckets
 * follows the input order (callers pass project→global→plugin sorted lists),
 * so the buckets render in a stable, predictable sequence.
 */
export function groupSkills(list: Skill[]): ScopeBucket[] {
  const buckets = new Map<string, { top: Skill[]; nested: Map<string, Skill[]> }>();

  for (const s of list) {
    const label = scopeLabel(s);
    let bucket = buckets.get(label);
    if (!bucket) {
      bucket = { top: [], nested: new Map() };
      buckets.set(label, bucket);
    }
    if (!s.group) {
      bucket.top.push(s);
    } else {
      const existing = bucket.nested.get(s.group);
      if (existing) existing.push(s);
      else bucket.nested.set(s.group, [s]);
    }
  }

  return [...buckets.entries()].map(([label, bucket]) => ({
    label,
    top: bucket.top,
    nested: [...bucket.nested.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, skills]) => ({ folder, skills })),
  }));
}
