/**
 * Centralized state store for the sessions webview.
 * All mutable state lives here. Other modules read via getters and
 * mutate via explicit setter functions so changes are easy to trace.
 */

import type { Session, SessionDetail, Stats } from "../types";
import type { DateFilter, View } from "../../../webview/types";
import { dayStart } from "../../../webview/utils";
import { getPersisted, setPersisted } from "../../../webview/persistence";

/**
 * Persisted-state keys. Namespaced under "sessions." so other features can
 * coexist in the same vscode.setState bag without colliding.
 */
const PERSIST_KEY_FILTER_PROJECT = "sessions.filterProject";
const PERSIST_KEY_FILTER_DATE = "sessions.filterDate";

// ── Raw state ──

let allSessions: Session[] = [];
let stats: Stats = { totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 };
let pinnedIds: Set<string> = new Set();
let deletedIds: Set<string> = new Set();
let selectedId: string | null = null;
let detail: SessionDetail | null = null;
let searchQuery = "";
let loading = false;
let filterProject = "current";
let filterDate: DateFilter = "recent";
let visibleCount = 30;
let workspacePath = "";
let currentProjectName = "";
let view: View = "list";
let shellMounted = false;
let restoreWindowMinutes = 30;

// ── Getters ──

/** Return all sessions (unfiltered). */
export function getAllSessions(): Session[] { return allSessions; }

/** Return aggregated stats received from the extension. */
export function getStats(): Stats { return stats; }

/** Return the set of pinned session IDs. */
export function getPinnedIds(): Set<string> { return pinnedIds; }

/** Return the set of deleted session IDs. */
export function getDeletedIds(): Set<string> { return deletedIds; }

/** Return the currently selected session ID (if any). */
export function getSelectedId(): string | null { return selectedId; }

/** Return the full detail object for the currently viewed session. */
export function getDetail(): SessionDetail | null { return detail; }

/** Return the current search query (lowercase). */
export function getSearchQuery(): string { return searchQuery; }

/** Return whether a detail request is in progress. */
export function isLoading(): boolean { return loading; }

/** Return the active project filter value. */
export function getFilterProject(): string { return filterProject; }

/** Return the active date filter value. */
export function getFilterDate(): DateFilter { return filterDate; }

/** Return how many items are shown before "Show more". */
export function getVisibleCount(): number { return visibleCount; }

/** Return the workspace folder path. */
export function getWorkspacePath(): string { return workspacePath; }

/** Return the derived project name from the workspace path. */
export function getCurrentProjectName(): string { return currentProjectName; }

/** Return the current view mode. */
export function getView(): View { return view; }

/** Return whether the shell DOM has been mounted. */
export function isShellMounted(): boolean { return shellMounted; }

// ── Setters ──

/** Replace the full session list with newly received data. */
export function setSessions(sessions: Session[]): void { allSessions = sessions; }

/** Update aggregated stats. */
export function setStats(s: Stats): void { stats = s; }

/** Replace pinned IDs from persisted user state. */
export function setPinnedIds(ids: string[]): void { pinnedIds = new Set(ids); }

/** Replace deleted IDs from persisted user state. */
export function setDeletedIds(ids: string[]): void { deletedIds = new Set(ids); }

/** Set the selected session ID. */
export function setSelectedId(id: string | null): void { selectedId = id; }

/** Set the full session detail object. */
export function setDetail(d: SessionDetail | null): void { detail = d; }

/** Set the search query string. */
export function setSearchQuery(q: string): void { searchQuery = q; }

/** Set the loading flag. */
export function setLoading(v: boolean): void { loading = v; }

/** Set the active project filter. Persists across panel reloads. */
export function setFilterProject(p: string): void {
  filterProject = p;
  setPersisted(PERSIST_KEY_FILTER_PROJECT, p);
}

/** Set the active date filter. Persists across panel reloads. */
export function setFilterDate(d: DateFilter): void {
  filterDate = d;
  setPersisted(PERSIST_KEY_FILTER_DATE, d);
}

/**
 * Restore filter state from persisted webview storage. Call once during
 * bootstrap, after initPersistence(), so the user's last in-app filter
 * selection wins over the global default from settings.json.
 */
export function loadPersistedFilters(): void {
  const persistedProject = getPersisted<string>(PERSIST_KEY_FILTER_PROJECT);
  if (persistedProject !== undefined) filterProject = persistedProject;

  const persistedDate = getPersisted<DateFilter>(PERSIST_KEY_FILTER_DATE);
  if (persistedDate !== undefined) filterDate = persistedDate;
}

/** Whether filterProject has been restored from persistence. */
export function hasPersistedFilterProject(): boolean {
  return getPersisted<string>(PERSIST_KEY_FILTER_PROJECT) !== undefined;
}

/** Whether filterDate has been restored from persistence. */
export function hasPersistedFilterDate(): boolean {
  return getPersisted<DateFilter>(PERSIST_KEY_FILTER_DATE) !== undefined;
}

/** Set how many list items are visible. */
export function setVisibleCount(n: number): void { visibleCount = n; }

/** Increment the visible count by a given amount. */
export function incrementVisibleCount(n: number): void { visibleCount += n; }

/**
 * Set workspace path and derive the project name from it.
 *
 * The derived `currentProjectName` is lowercased so that comparisons against
 * `Session.project` (which preserves the original casing for display) are
 * case-insensitive. Required for Windows where the same project can show up
 * with different casing depending on whether the path came from VS Code's
 * `fsPath` or Claude CLI's `history.jsonl`.
 *
 * Falls back to the "all" filter when no workspace is open so the panel still
 * shows something useful instead of empty.
 */
export function setWorkspacePath(p: string): void {
  workspacePath = p;
  const tail = p.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
  currentProjectName = tail.toLowerCase();
  if (!currentProjectName && filterProject === "current") filterProject = "all";
}

/** Set the current view mode. */
export function setView(v: View): void { view = v; }

/** Mark the shell DOM as mounted. */
export function setShellMounted(v: boolean): void { shellMounted = v; }

/** Set the restore workspace time window from settings. */
export function setRestoreWindowMinutes(m: number): void { restoreWindowMinutes = m; }

// ── Derived data ──

/**
 * Return sessions filtered by current project filter, date filter,
 * search query, and deletion status. Results are sorted with pinned
 * sessions first, then by most recent activity.
 */
export function getFiltered(): Session[] {
  let list = allSessions.filter((s) => !deletedIds.has(s.id));

  if (filterProject === "current") {
    // Only narrow when we know the current project. If the workspace path
    // hasn't resolved yet (cold-start race), fall through and show every
    // session — better than an empty list that looks like the bug "no
    // sessions yet" message.
    if (currentProjectName) {
      list = list.filter((s) => s.projectKey === currentProjectName);
    }
  } else if (filterProject !== "all") {
    list = list.filter((s) => s.project === filterProject);
  }

  if (filterDate === "week" || filterDate === "month") {
    const now = Date.now();
    const cutoff = filterDate === "week" ? now - 7 * 86400000 : now - 30 * 86400000;
    list = list.filter((s) => s.endTime >= cutoff || pinnedIds.has(s.id));
  }
  // "recent" and "all" don't filter by date — "recent" is enforced by slicing later

  if (searchQuery) {
    // searchQuery is already lowercased in searchBar.ts before being stored,
    // and searchHaystack is pre-lowercased at parse time. One includes()
    // per session, zero string allocation per keystroke.
    list = list.filter((s) => s.searchHaystack.includes(searchQuery));
  }

  list.sort((a, b) => {
    const ap = pinnedIds.has(a.id) ? 1 : 0;
    const bp = pinnedIds.has(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.endTime - a.endTime;
  });

  // "Recent" shows top 20 most recent sessions (regardless of date).
  // Pinned sessions stay visible because they sort first.
  if (filterDate === "recent") {
    const pinned = list.filter((s) => pinnedIds.has(s.id));
    const unpinned = list.filter((s) => !pinnedIds.has(s.id)).slice(0, 20);
    return [...pinned, ...unpinned];
  }

  return list;
}

/**
 * Return the "last working session group" — sessions that were active
 * around the same time, representing the user's last set of open terminals.
 *
 * Algorithm: find the most recent session, then include all other sessions
 * whose endTime is within 30 minutes of it. Scoped to the current project
 * if a workspace is open, otherwise across all projects.
 *
 * @returns Sessions from the last cluster, sorted oldest-to-newest so they
 *   open in the order the user originally started them.
 */
export function getLastSessionGroup(): Session[] {
  const WINDOW_MS = restoreWindowMinutes * 60 * 1000;

  let candidates = allSessions.filter((s) => !deletedIds.has(s.id));
  if (currentProjectName) {
    candidates = candidates.filter((s) => s.projectKey === currentProjectName);
  }

  if (candidates.length === 0) return [];

  // Find the most recent endTime
  const anchor = Math.max(...candidates.map((s) => s.endTime));
  const cutoff = anchor - WINDOW_MS;

  // Return all sessions within the window, oldest first
  return candidates
    .filter((s) => s.endTime >= cutoff)
    .sort((a, b) => a.endTime - b.endTime);
}

/**
 * Return a list of all project names, sorted with the current project
 * first, then by most recent activity.
 */
export function getProjects(): string[] {
  const latestActivity = new Map<string, number>();
  for (const s of allSessions) {
    if (deletedIds.has(s.id)) continue;
    const prev = latestActivity.get(s.project) || 0;
    if (s.endTime > prev) latestActivity.set(s.project, s.endTime);
  }
  // Index project display names to their pre-computed lowercase keys so the
  // current-project comparison does not allocate during sort.
  const keyByProject = new Map<string, string>();
  for (const s of allSessions) {
    if (!keyByProject.has(s.project)) keyByProject.set(s.project, s.projectKey);
  }

  return [...latestActivity.keys()].sort((a, b) => {
    if (keyByProject.get(a) === currentProjectName) return -1;
    if (keyByProject.get(b) === currentProjectName) return 1;
    return (latestActivity.get(b) || 0) - (latestActivity.get(a) || 0);
  });
}
