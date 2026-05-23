/**
 * Reactive feature state for the sessions webview, plus the pure selectors
 * and the delta-apply helper that drive list rendering.
 *
 * All mutable view state lives in `@preact/signals` so components re-render
 * automatically on change. The derived selectors (`getFiltered`,
 * `getLastSessionGroup`, `getProjects`) are pure functions of the current
 * signal values — they read `.value` and return a fresh array, so calling
 * them from inside a component body subscribes that component to every
 * input signal.
 */
import { computed, effect, signal } from "@preact/signals";
import { getPersisted, setPersisted } from "../../../../webview/persistence";
import type { DateFilter, View } from "../../../../webview/types";
import type { Session, SessionDetail, Stats } from "../../types";
import {
  type BranchOption,
  type ProjectOption,
  buildBranchOptions,
  buildProjectOptions,
  listBranches,
  orderProjects,
} from "../lib";

// Re-export the option types so consumers can keep importing them from the
// model surface alongside the selectors that produce them.
export type { BranchOption, ProjectOption };

const EMPTY_STATS: Stats = { totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 };

// ── Raw signals ──

/** Every session received from the host, unfiltered. */
export const sessionsSignal = signal<Session[]>([]);
/** Aggregate stats echoed by the host alongside the list. */
export const statsSignal = signal<Stats>(EMPTY_STATS);
/** Pinned session IDs from persisted user state. */
export const pinnedSignal = signal<Set<string>>(new Set());
/** Deleted (hidden) session IDs from persisted user state. */
export const deletedSignal = signal<Set<string>>(new Set());
/** Currently open detail, or null when on the list. */
export const detailSignal = signal<SessionDetail | null>(null);
/** True while a detail request is in flight (shows the loading shell). */
export const detailLoadingSignal = signal<boolean>(false);
/** "list" or "detail" — which panel is visible. */
export const viewSignal = signal<View>("list");
/** Selected session id (highlights the row whose detail is open). */
export const selectedIdSignal = signal<string | null>(null);

/** Lowercased metadata search query. Empty = no search. */
export const searchQuerySignal = signal<string>("");
/** Full-text (transcript) hits keyed to the query that produced them. */
export const fullTextSignal = signal<{ query: string; ids: Set<string> }>({
  query: "",
  ids: new Set(),
});

/** Active project filter: "current", "all", or a concrete project name. */
export const filterProjectSignal = signal<string>("current");
/** Active date filter. */
export const filterDateSignal = signal<DateFilter>("recent");
/** Active branch filter: "all" or a concrete branch name. */
export const filterBranchSignal = signal<string>("all");

/** Number of list rows shown before the virtual list caps further. */
export const visibleCountSignal = signal<number>(30);

/** Workspace folder path, used to derive the current project name. */
export const workspacePathSignal = signal<string>("");
/** Lowercased current project name derived from the workspace path. */
export const currentProjectSignal = signal<string>("");
/** Current git branch of the workspace ("" = unknown / no repo). */
export const currentBranchSignal = signal<string>("");

/** Bulk-select mode toggle. */
export const bulkModeSignal = signal<boolean>(false);
/** Bulk-selected session ids. */
export const selectionSignal = signal<Set<string>>(new Set());

/** Window into the workspace-restore cluster (minutes). */
export const restoreWindowMinutesSignal = signal<number>(30);

// ── Setters with derived side effects ──

/**
 * Set the workspace path and derive the (lowercased) current project name.
 * Falls back to the "all" project filter when no workspace is open so the
 * panel still shows something useful rather than an empty list.
 */
export function setWorkspacePath(p: string): void {
  workspacePathSignal.value = p;
  const tail = p.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
  currentProjectSignal.value = tail.toLowerCase();
  if (!currentProjectSignal.value && filterProjectSignal.value === "current") {
    filterProjectSignal.value = "all";
  }
}

/** Replace pinned ids from a host userState message. */
export function setPinned(ids: string[]): void {
  pinnedSignal.value = new Set(ids);
}

/** Replace deleted ids from a host userState message. */
export function setDeleted(ids: string[]): void {
  deletedSignal.value = new Set(ids);
}

/**
 * Apply a fresh full-text result set only if it still matches the live
 * query. Replies for a superseded query are dropped so a slow host scan
 * cannot resurrect stale matches after the user has typed further.
 */
export function setFullTextHits(query: string, ids: string[]): void {
  if (query !== searchQuerySignal.value) return;
  fullTextSignal.value = { query, ids: new Set(ids) };
}

/** Drop pending full-text hits — called when the query falls below the scan threshold. */
export function clearFullTextHits(): void {
  fullTextSignal.value = { query: "", ids: new Set() };
}

/** Enter or leave bulk mode, clearing the selection on exit. */
export function setBulkMode(on: boolean): void {
  bulkModeSignal.value = on;
  if (!on) selectionSignal.value = new Set();
}

/** Toggle a single id in the bulk selection. */
export function toggleSelected(id: string): void {
  const next = new Set(selectionSignal.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectionSignal.value = next;
}

/** Replace the bulk selection with an explicit id set. */
export function selectAll(ids: string[]): void {
  selectionSignal.value = new Set(ids);
}

/** Drop the bulk selection and exit bulk mode. */
export function clearSelection(): void {
  selectionSignal.value = new Set();
  bulkModeSignal.value = false;
}

// ── Pure selectors ──

/**
 * Visible sessions after applying the project / date / branch / search
 * filters and sorting pinned-first, then most-recent. Mirrors the v1
 * `getFiltered` semantics exactly so the migrated list behaves identically.
 */
export function getFiltered(): Session[] {
  const all = sessionsSignal.value;
  const deleted = deletedSignal.value;
  const pinned = pinnedSignal.value;
  const project = filterProjectSignal.value;
  const currentProject = currentProjectSignal.value;
  const date = filterDateSignal.value;
  const branch = filterBranchSignal.value;
  const query = searchQuerySignal.value;
  const ft = fullTextSignal.value;

  let list = all.filter((s) => !deleted.has(s.id));

  if (project === "current") {
    // Only narrow when the current project is known; a cold-start race
    // (workspace not resolved yet) shows everything rather than an
    // empty list that reads like "no sessions".
    if (currentProject) list = list.filter((s) => s.projectKey === currentProject);
  } else if (project !== "all") {
    list = list.filter((s) => s.project === project);
  }

  if (date === "week" || date === "month") {
    const now = Date.now();
    const cutoff = date === "week" ? now - 7 * 86400000 : now - 30 * 86400000;
    list = list.filter((s) => s.endTime >= cutoff || pinned.has(s.id));
  }

  if (branch !== "all") {
    list = list.filter((s) => {
      if (pinned.has(s.id)) return true;
      return (s.branch || "(no branch)") === branch;
    });
  }

  if (query) {
    const hits = ft.query === query ? ft.ids : null;
    list = list.filter(
      (s) => s.searchHaystack.includes(query) || (hits !== null && hits.has(s.id)),
    );
  }

  list = list.slice().sort((a, b) => {
    const ap = pinned.has(a.id) ? 1 : 0;
    const bp = pinned.has(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.endTime - a.endTime;
  });

  if (date === "recent") {
    const pin = list.filter((s) => pinned.has(s.id));
    const rest = list.filter((s) => !pinned.has(s.id)).slice(0, 20);
    return [...pin, ...rest];
  }

  return list;
}

/**
 * The "last working session group" — sessions active within
 * `restoreWindowMinutes` of the most recent one, scoped to the current
 * project when known. Sorted oldest-first so terminals reopen in start
 * order. Backs the Restore Workspace action.
 */
export function getLastSessionGroup(): Session[] {
  const windowMs = restoreWindowMinutesSignal.value * 60 * 1000;
  const deleted = deletedSignal.value;
  const currentProject = currentProjectSignal.value;

  let candidates = sessionsSignal.value.filter((s) => !deleted.has(s.id));
  if (currentProject) candidates = candidates.filter((s) => s.projectKey === currentProject);
  if (candidates.length === 0) return [];

  const anchor = Math.max(...candidates.map((s) => s.endTime));
  const cutoff = anchor - windowMs;
  return candidates.filter((s) => s.endTime >= cutoff).sort((a, b) => a.endTime - b.endTime);
}

/**
 * All project names, current project first, then by most recent activity.
 * Thin signal-reading wrapper over the pure `orderProjects` lib helper.
 */
export function getProjects(): string[] {
  return orderProjects(sessionsSignal.value, deletedSignal.value, currentProjectSignal.value);
}

/**
 * Distinct branch names present in the (deletion-filtered) session list,
 * sorted alphabetically with the "(no branch)" sentinel last. Thin
 * signal-reading wrapper over the pure `listBranches` lib helper.
 */
export function getBranches(): string[] {
  return listBranches(sessionsSignal.value, deletedSignal.value);
}

/**
 * Project-filter options with per-project session counts. Thin signal-reading
 * wrapper over the pure `buildProjectOptions` lib helper.
 */
export function getProjectOptions(): ProjectOption[] {
  return buildProjectOptions(
    sessionsSignal.value,
    deletedSignal.value,
    currentProjectSignal.value,
  );
}

/**
 * Branch-filter options scoped to the active project filter. Thin
 * signal-reading wrapper over the pure `buildBranchOptions` lib helper.
 */
export function getBranchOptions(): BranchOption[] {
  return buildBranchOptions(
    sessionsSignal.value,
    deletedSignal.value,
    currentBranchSignal.value,
    filterProjectSignal.value,
    currentProjectSignal.value,
  );
}

/** Reactive count of the filtered list — handy for headers. */
export const filteredCount = computed(() => getFiltered().length);

// ── Delta application ──

/** Shape of a `sessions.delta` payload: incremental list mutations. */
export interface SessionsDelta {
  added?: Session[];
  updated?: Session[];
  removed?: string[];
}

/**
 * Apply an incremental delta to a session list, returning a NEW array
 * (never mutates the input) so a signal assignment triggers re-render.
 * Updates replace by id; additions append; removals drop by id. Unknown
 * updates are treated as additions so an out-of-order delta never loses
 * data.
 */
export function applyDelta(list: Session[], delta: SessionsDelta): Session[] {
  const byId = new Map(list.map((s) => [s.id, s]));
  for (const s of delta.updated ?? []) byId.set(s.id, s);
  for (const s of delta.added ?? []) byId.set(s.id, s);
  for (const id of delta.removed ?? []) byId.delete(id);
  return [...byId.values()];
}

// ── Filter persistence ──
//
// The project / date / branch filter choices survive a webview reload via the
// shared setState/getState-backed persistence bridge (initialised in main.tsx).
// Keys are namespaced under "sessions." so other features can share the same
// vscode.setState bag without colliding. Restoring the branch name itself (not
// a "current-branch" flag) is deliberate: the user can deliberately park on a
// named branch and keep that view after a checkout — the named-dropdown
// behaviour they expect (verbatim v1 rationale).

const PERSIST_KEY_FILTER_PROJECT = "sessions.filterProject";
const PERSIST_KEY_FILTER_DATE = "sessions.filterDate";
const PERSIST_KEY_FILTER_BRANCH = "sessions.filterBranch";

/**
 * Restore persisted filter choices into the signals. Call once during the
 * feature's mount, after initPersistence() has run in main.tsx, so the user's
 * last in-app selection wins over the default. Returns whether a project filter
 * was restored so the caller can skip the workspace-derived default.
 */
export function loadPersistedFilters(): void {
  const project = getPersisted<string>(PERSIST_KEY_FILTER_PROJECT);
  if (project !== undefined) filterProjectSignal.value = project;

  const date = getPersisted<DateFilter>(PERSIST_KEY_FILTER_DATE);
  if (date !== undefined) filterDateSignal.value = date;

  const branch = getPersisted<string>(PERSIST_KEY_FILTER_BRANCH);
  if (typeof branch === "string") filterBranchSignal.value = branch;
}

let _persistDisposer: (() => void) | null = null;

/**
 * Begin persisting filter-signal changes. Wires a single `effect` that writes
 * the three filter signals back to persisted state whenever any of them
 * changes. Idempotent — calling twice disposes the previous subscription so a
 * remount (e.g. tab switch) never stacks duplicate writers.
 */
export function initFilterPersistence(): void {
  _persistDisposer?.();
  _persistDisposer = effect(() => {
    setPersisted(PERSIST_KEY_FILTER_PROJECT, filterProjectSignal.value);
    setPersisted(PERSIST_KEY_FILTER_DATE, filterDateSignal.value);
    setPersisted(PERSIST_KEY_FILTER_BRANCH, filterBranchSignal.value);
  });
}

/** Stop persisting filter changes. Returns the signals to non-persisting state. */
export function stopFilterPersistence(): void {
  _persistDisposer?.();
  _persistDisposer = null;
}

/** Reset all signals to defaults. Test-only helper. */
export function _resetSessionsSignals(): void {
  sessionsSignal.value = [];
  statsSignal.value = EMPTY_STATS;
  pinnedSignal.value = new Set();
  deletedSignal.value = new Set();
  detailSignal.value = null;
  detailLoadingSignal.value = false;
  viewSignal.value = "list";
  selectedIdSignal.value = null;
  searchQuerySignal.value = "";
  fullTextSignal.value = { query: "", ids: new Set() };
  filterProjectSignal.value = "current";
  filterDateSignal.value = "recent";
  filterBranchSignal.value = "all";
  visibleCountSignal.value = 30;
  workspacePathSignal.value = "";
  currentProjectSignal.value = "";
  currentBranchSignal.value = "";
  bulkModeSignal.value = false;
  selectionSignal.value = new Set();
  restoreWindowMinutesSignal.value = 30;
}
