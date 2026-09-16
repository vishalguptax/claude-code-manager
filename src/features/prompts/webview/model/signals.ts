/**
 * Reactive state for the Prompt History tab.
 *
 * `prompts` is the one source signal — the whole history, as the host sent it.
 * Everything the view reads is derived, so a keystroke recomputes a filter
 * over an in-memory array instead of asking the host to re-read the file.
 */
import { computed, signal } from "@preact/signals";
import type { PromptEntry } from "../../types";
import {
  ALL_PROJECTS,
  buildHaystacks,
  filterPrompts,
  listPromptProjects,
  type PromptProject,
} from "../lib";

/** Every prompt the host knows about, newest first. */
export const prompts = signal<PromptEntry[]>([]);

/** True until the first `promptHistory` message lands. */
export const loading = signal<boolean>(true);

/** Free-text filter over prompt text and project name. */
export const searchQuery = signal<string>("");

/** Selected project path, or {@link ALL_PROJECTS}. */
export const projectFilter = signal<string>(ALL_PROJECTS);

/** Host-reported error, or null when healthy. */
export const errorMessage = signal<string | null>(null);

/** Projects represented in the history, busiest first. */
export const projects = computed<PromptProject[]>(() => listPromptProjects(prompts.value));

/**
 * Lowercased search text, index-aligned with `prompts`.
 *
 * Its own computed on purpose: it depends on `prompts` alone, so typing does
 * not re-fold four thousand strings — only replacing the data does.
 */
const haystacks = computed<string[]>(() => buildHaystacks(prompts.value));

/** The rows the list renders, after the search and project filters. */
export const visiblePrompts = computed<PromptEntry[]>(() =>
  filterPrompts(prompts.value, haystacks.value, searchQuery.value, projectFilter.value),
);

/**
 * Replace the prompt list and clear the loading state.
 *
 * Drops a project filter the new data no longer contains. Without this, a
 * refresh after the last prompt of a project aged out would leave the user
 * staring at an empty list with no visible reason for it.
 */
export function applyPrompts(next: PromptEntry[]): void {
  prompts.value = next;
  loading.value = false;
  errorMessage.value = null;
  const selected = projectFilter.value;
  if (selected !== ALL_PROJECTS && !next.some((e) => e.projectPath === selected)) {
    projectFilter.value = ALL_PROJECTS;
  }
}

/** Record a host error and stop the loading state. */
export function applyError(message: string): void {
  errorMessage.value = message;
  loading.value = false;
}

/** Reset every signal to its initial value. Used in tests. */
export function resetPromptSignals(): void {
  prompts.value = [];
  loading.value = true;
  searchQuery.value = "";
  projectFilter.value = ALL_PROJECTS;
  errorMessage.value = null;
}
