/**
 * Pure helpers for the Prompt History tab.
 *
 * The host ships the whole prompt list once and this module does every
 * subsequent narrowing. That split is deliberate: the alternative — asking the
 * host to filter — would stat and re-read `history.jsonl` on every keystroke
 * for a list that is already sitting in the webview.
 *
 * The cost that matters at four thousand rows is case folding. Lowercasing
 * every prompt on every keystroke allocates megabytes per character typed, so
 * {@link buildHaystacks} does it once per data change and
 * {@link filterPrompts} reads the result.
 */
import type { PromptEntry } from "../../types";

/** `projectFilter` value meaning "every project". Not a real project path. */
export const ALL_PROJECTS = "";

/** One entry in the project filter dropdown. */
export interface PromptProject {
  /** Absolute project path — the filter value. */
  path: string;
  /** Last path segment, for display. */
  name: string;
  /** How many prompt rows belong to it. */
  count: number;
}

/**
 * The projects represented in `entries`, busiest first, ties broken
 * alphabetically so the order is stable between refreshes.
 *
 * Keyed on the full path, not the folder name: two checkouts of the same repo
 * are two projects, and merging them would send "open session" to the wrong
 * one.
 */
export function listPromptProjects(entries: PromptEntry[]): PromptProject[] {
  const counts = new Map<string, PromptProject>();
  for (const entry of entries) {
    if (!entry.projectPath) continue;
    const found = counts.get(entry.projectPath);
    if (found) {
      found.count++;
    } else {
      counts.set(entry.projectPath, {
        path: entry.projectPath,
        name: entry.projectName || entry.projectPath,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

/**
 * Lowercased search text for each entry, index-aligned with `entries`.
 *
 * Includes the project name so typing a repo name narrows to it without
 * touching the dropdown.
 */
export function buildHaystacks(entries: PromptEntry[]): string[] {
  // "\n" between the fields so a query cannot match across the boundary
  // between a prompt's last word and its project's first.
  return entries.map((e) => `${e.text}\n${e.projectName}`.toLowerCase());
}

/**
 * Split a query into the terms every match must contain.
 *
 * Multi-term AND rather than substring: searching four thousand prompts for
 * "parser cache" should find the prompt that mentions both, in either order.
 */
export function queryTerms(query: string): string[] {
  const trimmed = query.trim().toLowerCase();
  return trimmed ? trimmed.split(/\s+/) : [];
}

/**
 * Narrow `entries` to those matching every query term and the selected
 * project. `haystacks` must be {@link buildHaystacks} over the same array.
 *
 * Order is preserved, so the newest-first order the host produced survives.
 */
export function filterPrompts(
  entries: PromptEntry[],
  haystacks: string[],
  query: string,
  projectPath: string,
): PromptEntry[] {
  const terms = queryTerms(query);
  if (terms.length === 0 && projectPath === ALL_PROJECTS) return entries;

  const out: PromptEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (projectPath !== ALL_PROJECTS && entry.projectPath !== projectPath) continue;
    const haystack = haystacks[i] ?? "";
    if (terms.every((term) => haystack.includes(term))) out.push(entry);
  }
  return out;
}

/**
 * Collapse a prompt to one line, cut to `max` characters.
 *
 * For surfaces that get one line and no wrapping — the command palette's
 * title row. The list itself never calls this: there the full text stays in
 * the DOM and CSS clamps it.
 */
export function promptSummary(text: string, max = 80): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * A search query that brings one prompt to the top of the list.
 *
 * The palette can only hand the tab a filter — there is no per-row selection
 * to restore — so choosing a palette result sets this as the search query.
 * First words only, and no ellipsis: {@link filterPrompts} requires every
 * term to be present in the entry's haystack, so a "…" would match nothing.
 */
export function promptSearchKey(text: string, words = 6): string {
  return text.replace(/\s+/g, " ").trim().split(" ").slice(0, words).join(" ");
}
