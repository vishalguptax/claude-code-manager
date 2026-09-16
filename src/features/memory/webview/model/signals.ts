/**
 * Reactive state for the Memory tab.
 *
 * Source state is the store the host sent plus the three things the user
 * controls — which project, which health lens, what they typed. Everything
 * else is `computed`, so the views read a finished list rather than filtering
 * inline on every render.
 */
import { computed, signal } from "@preact/signals";
import type { MemoryFile, MemoryProject, MemoryStore } from "../../types";
import {
  applyLens,
  type MemoryLens,
  memoriesInProject,
  searchMemories,
  storeTotals,
} from "../lib";

/** The whole store as the host last sent it. Null until the first reply. */
export const store = signal<MemoryStore | null>(null);

/** True until the first `memoryStore` message lands. */
export const loading = signal<boolean>(true);

/** Host-reported error message, or null when healthy. */
export const errorMessage = signal<string | null>(null);

/** Selected project slug, or null for "every project". */
export const selectedProject = signal<string | null>(null);

/** Active health lens. */
export const lens = signal<MemoryLens>("all");

/** Free-text filter over the visible memories. */
export const searchQuery = signal<string>("");

/** Id of the memory whose detail view is open, or null for the list. */
export const selectedId = signal<string | null>(null);

/** Projects that have memories, in store order (alphabetical by label). */
export const projects = computed<MemoryProject[]>(() => store.value?.projects ?? []);

/** Store-wide totals behind the lens labels. */
export const totals = computed(() => storeTotals(store.value));

/** The visible list: project scope, then health lens, then search. */
export const visibleMemories = computed<MemoryFile[]>(() =>
  searchMemories(
    applyLens(memoriesInProject(store.value, selectedProject.value), lens.value),
    searchQuery.value,
  ),
);

/**
 * The memory the detail view is showing, or null.
 *
 * Resolved from the live store by id rather than held as its own signal, so a
 * host re-push after a delete drops the detail view instead of leaving it
 * rendering a file that is gone.
 */
export const selectedMemory = computed<MemoryFile | null>(() => {
  const id = selectedId.value;
  if (id === null || store.value === null) return null;
  for (const project of store.value.projects) {
    const found = project.memories.find((m) => m.id === id);
    if (found !== undefined) return found;
  }
  return null;
});

/** Replace the store and clear the loading state. */
export function applyStore(next: MemoryStore): void {
  store.value = next;
  loading.value = false;
  errorMessage.value = null;
}

/** Record a host error and stop loading. */
export function applyError(message: string): void {
  errorMessage.value = message;
  loading.value = false;
}

/** Open the detail view for one memory. */
export function selectMemory(id: string | null): void {
  selectedId.value = id;
}

/** Reset every signal to its initial value. Used in tests. */
export function resetMemorySignals(): void {
  store.value = null;
  loading.value = true;
  errorMessage.value = null;
  selectedProject.value = null;
  lens.value = "all";
  searchQuery.value = "";
  selectedId.value = null;
}
