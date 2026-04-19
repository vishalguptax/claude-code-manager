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
/**
 * Branch filter value: "all" for no filter, or a concrete branch name.
 * Persisted across panel reloads. Storing the branch name itself (not a
 * "current-branch" boolean) so the user can deliberately park on a
 * specific branch and keep that view after a checkout — the behaviour
 * users expect from a named branch dropdown.
 */
const PERSIST_KEY_FILTER_BRANCH = "sessions.filterBranch";

// ── Raw state ──

let allSessions: Session[] = [];
let stats: Stats = { totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 };
let pinnedIds: Set<string> = new Set();
let deletedIds: Set<string> = new Set();
let selectedId: string | null = null;
let detail: SessionDetail | null = null;
let searchQuery = "";
/**
 * Session IDs returned by the latest full-text (transcript content) search.
 * The extension host keeps the text index and replies asynchronously; we
 * store the hits here and union them with the local `searchHaystack`
 * matches when deriving the visible list. The `fullTextQuery` sibling
 * pins these hits to a specific query so reply arrivals for older queries
 * do not leak into the current view.
 */
let fullTextIds: Set<string> = new Set();
let fullTextQuery = "";
let loading = false;
let filterProject = "current";
let filterDate: DateFilter = "recent";
let visibleCount = 30;
let workspacePath = "";
let currentProjectName = "";
/** Current git branch of the workspace — empty when unknown or no repo. */
let currentBranch = "";
/**
 * Active branch filter. `"all"` (default) means no filter. Any other
 * value narrows the list to sessions whose `branch` equals this string.
 * Sentinel "(no branch)" represents sessions recorded outside a git
 * repo — the branch dropdown collapses those into one bucket.
 */
let filterBranch = "all";
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

/** Return the current git branch (empty when unknown). */
export function getCurrentBranch(): string { return currentBranch; }

/** Return the active branch filter ("all" when nothing is filtered). */
export function getFilterBranch(): string { return filterBranch; }

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

/**
 * Apply a fresh set of full-text hits if the reply still corresponds to
 * the current search query. Replies for a superseded query are dropped
 * so a slow extension-host scan cannot resurrect stale results after the
 * user has typed further or cleared the box.
 */
export function setFullTextHits(query: string, ids: string[]): void {
  if (query !== searchQuery) return;
  fullTextQuery = query;
  fullTextIds = new Set(ids);
}

/** Drop any pending full-text hits — called when the query is cleared. */
export function clearFullTextHits(): void {
  fullTextQuery = "";
  fullTextIds = new Set();
}

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

/** Set the current git branch (empty string means "unknown / no repo"). */
export function setCurrentBranch(b: string): void { currentBranch = b; }

/** Set the active branch filter and persist the choice across reloads. */
export function setFilterBranch(b: string): void {
  filterBranch = b;
  setPersisted(PERSIST_KEY_FILTER_BRANCH, b);
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

  const persistedBranch = getPersisted<string>(PERSIST_KEY_FILTER_BRANCH);
  if (typeof persistedBranch === "string") filterBranch = persistedBranch;
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

  // Branch filter. "all" disables it. The "(no branch)" sentinel
  // surfaces sessions that had no git branch recorded (projects opened
  // outside a repo). Pinned sessions bypass so a favourite from another
  // branch stays visible when the user pivots context.
  if (filterBranch !== "all") {
    list = list.filter((s) => {
      if (pinnedIds.has(s.id)) return true;
      const key = s.branch || "(no branch)";
      return key === filterBranch;
    });
  }
  // "recent" and "all" don't filter by date — "recent" is enforced by slicing later

  if (searchQuery) {
    // searchQuery is already lowercased in searchBar.ts before being stored,
    // and searchHaystack is pre-lowercased at parse time. One includes()
    // per session, zero string allocation per keystroke.
    //
    // Union with full-text (transcript) hits so a query like "refactor the
    // parser" matches both sessions whose title contains the phrase AND
    // sessions where the phrase appears in the message body. Only trust
    // hits whose echoed query matches the current one — a race between a
    // slow scan and a fast keystroke could otherwise show stale matches.
    const hits = fullTextQuery === searchQuery ? fullTextIds : null;
    list = list.filter(
      (s) =>
        s.searchHaystack.includes(searchQuery) ||
        (hits !== null && hits.has(s.id)),
    );
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
