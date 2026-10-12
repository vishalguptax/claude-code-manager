/**
 * Pure model of the sessions explorer, shaped like a file manager: a home
 * location holding folders and the sessions not filed in any, each folder
 * holding its sessions, and three cross-cutting views (All, Pinned,
 * Archived). No signal reads — every rule here is testable on plain data.
 */
import type { Session } from "../../types";
import { folderKey } from "./groups";

/** Where the explorer is. `home` is the root: folders plus unfiled sessions. */
export type ExplorerLocation =
  | { kind: "home" }
  | { kind: "folder"; name: string }
  | { kind: "all" }
  | { kind: "pinned" }
  | { kind: "archived" };

/** One thing the content pane shows. `key` is unique across both kinds. */
export type ExplorerItem =
  | { kind: "folder"; key: string; name: string; count: number; modified: number }
  | { kind: "session"; key: string; session: Session; folder: string | undefined };

export type SortKey = "name" | "project" | "modified" | "messages";
export interface ExplorerSort {
  key: SortKey;
  dir: "asc" | "desc";
}

/** Everything item building reads, passed in so this stays signal-free. */
export interface ExplorerInput {
  sessions: readonly Session[];
  /** Every folder, empty ones included. */
  folderNames: readonly string[];
  /** Session ID -> folder name. */
  folders: ReadonlyMap<string, string>;
  pinned: ReadonlySet<string>;
  archived: ReadonlySet<string>;
  deleted: ReadonlySet<string>;
  /** The project filter, as a predicate (see `matchesProject`). */
  inProject: (s: Session) => boolean;
  /** Lowercased search text; "" when not searching. */
  query: string;
  /** Full-text hits for `query`, or null while the host has not answered. */
  hits: ReadonlySet<string> | null;
}

export const HOME: ExplorerLocation = { kind: "home" };

export function sessionKey(id: string): string {
  return `session:${id}`;
}

/** The name a session goes by: its given name, else its opening prompt. */
export function sessionTitle(s: Session): string {
  return s.name || s.prompts[0] || "Untitled session";
}

export function sameLocation(a: ExplorerLocation, b: ExplorerLocation): boolean {
  return a.kind === b.kind && (a.kind !== "folder" || a.name === (b as { name: string }).name);
}

/** The label a location goes by in the breadcrumb and the window. */
export function locationLabel(loc: ExplorerLocation): string {
  switch (loc.kind) {
    case "home":
      return "Sessions";
    case "folder":
      return loc.name;
    case "all":
      return "All sessions";
    case "pinned":
      return "Pinned";
    case "archived":
      return "Archived";
  }
}

/**
 * True when a session is visible to the explorer at all: not deleted, in the
 * project filter, and matching the search. Archive membership is a location
 * question, settled by {@link buildItems}.
 */
function visible(s: Session, input: ExplorerInput): boolean {
  if (input.deleted.has(s.id) || !input.inProject(s)) return false;
  if (!input.query) return true;
  // The haystack covers names, prompts, project and branch; the host's
  // full-text index covers the transcripts. Same pair the sidebar uses.
  return s.searchHaystack.includes(input.query) || (input.hits?.has(s.id) ?? false);
}

function compareBy(sort: ExplorerSort): (a: ExplorerItem, b: ExplorerItem) => number {
  const dir = sort.dir === "asc" ? 1 : -1;
  const name = (i: ExplorerItem): string => (i.kind === "folder" ? i.name : sessionTitle(i.session));
  const text = (a: string, b: string): number =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return (a, b) => {
    // Folders lead whatever the sort, as in every file manager.
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    let c = 0;
    switch (sort.key) {
      case "name":
        c = text(name(a), name(b));
        break;
      case "project":
        c =
          a.kind === "session" && b.kind === "session"
            ? text(a.session.project, b.session.project)
            : 0;
        break;
      case "modified":
        c =
          (a.kind === "folder" ? a.modified : a.session.endTime) -
          (b.kind === "folder" ? b.modified : b.session.endTime);
        break;
      case "messages":
        c =
          (a.kind === "folder" ? a.count : a.session.messageCount) -
          (b.kind === "folder" ? b.count : b.session.messageCount);
        break;
    }
    // Ties fall back to the name, so equal keys keep a stable, readable order.
    return c !== 0 ? c * dir : text(name(a), name(b));
  };
}

/** Per-folder session count and latest activity, over the visible, unarchived sessions. */
function folderStats(input: ExplorerInput): Map<string, { count: number; modified: number }> {
  const stats = new Map<string, { count: number; modified: number }>();
  for (const s of input.sessions) {
    const folder = input.folders.get(s.id);
    if (folder === undefined || input.archived.has(s.id) || !visible(s, { ...input, query: "" })) {
      continue;
    }
    const st = stats.get(folder) ?? { count: 0, modified: 0 };
    st.count++;
    st.modified = Math.max(st.modified, s.endTime);
    stats.set(folder, st);
  }
  return stats;
}

/**
 * The items a location shows, sorted.
 *
 * Searching from home searches everywhere — every folder's sessions plus the
 * folders whose names match — the way a file manager searches beneath the
 * folder you are in. Inside a folder or a view, search narrows that place.
 * Archived sessions appear only under Archived: archiving means "out of my
 * way", so they leave the folders they were filed in too.
 */
export function buildItems(
  input: ExplorerInput,
  location: ExplorerLocation,
  sort: ExplorerSort,
): ExplorerItem[] {
  const items: ExplorerItem[] = [];
  const searching = input.query !== "";

  if (location.kind === "home") {
    const stats = folderStats(input);
    for (const name of input.folderNames) {
      if (searching && !name.toLowerCase().includes(input.query)) continue;
      const st = stats.get(name) ?? { count: 0, modified: 0 };
      items.push({ kind: "folder", key: folderKey(name), name, ...st });
    }
  }

  for (const s of input.sessions) {
    if (!visible(s, input)) continue;
    const archived = input.archived.has(s.id);
    const folder = input.folders.get(s.id);
    let shown: boolean;
    switch (location.kind) {
      case "archived":
        shown = archived;
        break;
      case "home":
        shown = !archived && (searching || folder === undefined);
        break;
      case "folder":
        shown = !archived && folder === location.name;
        break;
      case "all":
        shown = !archived;
        break;
      case "pinned":
        shown = !archived && input.pinned.has(s.id);
        break;
    }
    if (shown) items.push({ kind: "session", key: sessionKey(s.id), session: s, folder });
  }

  return items.sort(compareBy(sort));
}

/**
 * Session counts for the navigation pane, keyed `home`, `all`, `pinned`,
 * `archived`, and `folder:<name>`. They honour the project filter but not
 * the search, so the pane keeps describing where things are while you type.
 */
export function locationCounts(input: ExplorerInput): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (key: string): void => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const unsearched = { ...input, query: "" };
  for (const s of input.sessions) {
    if (!visible(s, unsearched)) continue;
    if (input.archived.has(s.id)) {
      bump("archived");
      continue;
    }
    bump("all");
    if (input.pinned.has(s.id)) bump("pinned");
    const folder = input.folders.get(s.id);
    bump(folder === undefined ? "home" : folderKey(folder));
  }
  return counts;
}

/** The count key for a location, matching {@link locationCounts}. */
export function locationKey(loc: ExplorerLocation): string {
  return loc.kind === "folder" ? folderKey(loc.name) : loc.kind;
}

/**
 * The keys a shift-click selects: every item from the anchor to the target,
 * inclusive, in display order. With no anchor in the list (it was filtered
 * out, or nothing was clicked yet) the range is just the target.
 */
export function rangeKeys(keys: readonly string[], anchor: string | null, target: string): string[] {
  const from = anchor === null ? -1 : keys.indexOf(anchor);
  const to = keys.indexOf(target);
  if (to < 0) return [];
  if (from < 0) return [target];
  return keys.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/** Split items into rows of `size` — the tiles view lays a grid out row by row. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return rows;
}
