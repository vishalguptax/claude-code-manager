/**
 * Pure helpers for the Memory tab: flattening the store, searching it, and
 * answering the two questions the browser exists for — what does this memory
 * link to, and what links back to it.
 *
 * No signals, no DOM, no host calls: everything here takes data and returns
 * data so the views never compute inline and the logic is directly testable.
 */
import type { MemoryFile, MemoryProject, MemoryStore } from "../../types";

/** The health lenses the toolbar offers. */
export type MemoryLens = "all" | "orphans" | "broken";

/** Every memory across every project, projects in store order. */
export function flattenMemories(store: MemoryStore | null): MemoryFile[] {
  if (store === null) return [];
  return store.projects.flatMap((p) => p.memories);
}

/** Memories belonging to `slug`, or all of them when `slug` is null. */
export function memoriesInProject(
  store: MemoryStore | null,
  slug: string | null,
): MemoryFile[] {
  if (store === null) return [];
  if (slug === null) return flattenMemories(store);
  return store.projects.find((p) => p.slug === slug)?.memories ?? [];
}

/**
 * Case-insensitive substring search over the fields a user would think to
 * type: the slug, the one-line description, the body excerpt, the type tag
 * and the filename. The filename is included because it is what `MEMORY.md`
 * links and what the OS file manager shows, and on real data it does not
 * always match the slug.
 */
export function searchMemories(memories: MemoryFile[], query: string): MemoryFile[] {
  const q = query.trim().toLowerCase();
  if (q === "") return memories;
  return memories.filter((m) =>
    [m.meta.name, m.meta.description, m.excerpt, m.meta.type, m.fileName].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}

/** Narrow to the memories a health lens is about. */
export function applyLens(memories: MemoryFile[], lens: MemoryLens): MemoryFile[] {
  if (lens === "orphans") return memories.filter((m) => m.orphan);
  if (lens === "broken") return memories.filter((m) => m.links.some((l) => !l.resolved));
  return memories;
}

/** The project a memory belongs to, or null when the store no longer has it. */
export function projectOf(
  store: MemoryStore | null,
  memory: MemoryFile | null,
): MemoryProject | null {
  if (store === null || memory === null) return null;
  return store.projects.find((p) => p.slug === memory.project) ?? null;
}

/**
 * Resolve a `[[target]]` to the memory that declares it.
 *
 * Scoped to the linking memory's own project: Claude Code's memories never
 * reference another project's store, and matching across projects would make
 * a broken link look resolved because an unrelated repo happens to use the
 * same slug.
 */
export function resolveLink(
  store: MemoryStore | null,
  from: MemoryFile,
  target: string,
): MemoryFile | null {
  const project = projectOf(store, from);
  if (project === null) return null;
  return project.memories.find((m) => m.meta.name === target) ?? null;
}

/**
 * The memories that link TO `memory`, excluding itself. This is the other
 * half of `inboundCount` — the count tells the list a memory is reachable,
 * this tells the detail view from where.
 */
export function backlinksOf(store: MemoryStore | null, memory: MemoryFile): MemoryFile[] {
  const project = projectOf(store, memory);
  if (project === null) return [];
  return project.memories.filter(
    (m) => m.id !== memory.id && m.links.some((l) => l.target === memory.meta.name),
  );
}

/** The index entry pointing at `memory`, or null when it is not indexed. */
export function indexEntryOf(
  store: MemoryStore | null,
  memory: MemoryFile,
): { title: string; hook: string } | null {
  const project = projectOf(store, memory);
  const entry = project?.index.find((e) => e.fileName === memory.fileName);
  return entry === undefined ? null : { title: entry.title, hook: entry.hook };
}

/** Store-wide health totals, for the lens labels. */
export function storeTotals(store: MemoryStore | null): {
  total: number;
  orphans: number;
  broken: number;
} {
  const memories = flattenMemories(store);
  return {
    total: memories.length,
    orphans: memories.filter((m) => m.orphan).length,
    broken: memories.filter((m) => m.links.some((l) => !l.resolved)).length,
  };
}
