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
import type { Session, SessionDetail, Stats, WorktreeRef } from "../../types";
import {
  type BranchOption,
  type ProjectOption,
  type Row,
  type WorktreeFilter,
  type WorktreeMap,
  type WorktreeOption,
  buildBranchOptions,
  buildProjectOptions,
  buildRows,
  buildWorktreeOptions,
  currentRepoRoot,
  hasWorktrees,
  listBranches,
  matchesWorktreeFilter,
  orderProjects,
} from "../lib";

// Re-export the option types so consumers can keep importing them from the
// model surface alongside the selectors that produce them.
export type { BranchOption, ProjectOption, WorktreeFilter, WorktreeOption };

const EMPTY_STATS: Stats = { totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 };

// ── Raw signals ──

/**
 * Whether the first `sessions` (or terminating `error`) message has arrived.
 * Starts false so the tab shows the full-panel <Loading /> placeholder instead
 * of the "No sessions yet" empty-state during the cold-start round trip — an
 * empty list only reads as "no sessions" once we know the host has answered.
 */
export const loadedSignal = signal<boolean>(false);

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
/**
 * True while a host transcript scan is in flight for the current query.
 * The list shows metadata (haystack) matches immediately; full-text hits
 * arrive a beat later, so this drives a small "searching" spinner so the
 * user knows more results may still be coming.
 */
export const fullTextLoadingSignal = signal<boolean>(false);

/** Active project filter: "current", "all", or a concrete project name. */
export const filterProjectSignal = signal<string>("current");
/** Active date filter. */
export const filterDateSignal = signal<DateFilter>("recent");
/** Active branch filter: "all" or a concrete branch name. */
export const filterBranchSignal = signal<string>("all");
/** Active worktree-kind filter: "all", "main", "claude", or "user". */
export const filterWorktreeSignal = signal<WorktreeFilter>("all");

/**
 * Git-worktree metadata keyed by session id, from the host's `worktrees` push.
 * Arrives AFTER the `sessions` message, so it starts empty and the list groups
 * by project path exactly as before until it lands. Sessions absent from the
 * map are not inside a resolved worktree.
 */
export const worktreesSignal = signal<WorktreeMap>({});

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

/** Session ids that currently have an open terminal in the editor/panel. */
export const openTerminalsSignal = signal<Set<string>>(new Set());

export function setOpenTerminals(ids: string[]): void {
  openTerminalsSignal.value = new Set(ids);
}

/** Session ids backed by a temp (ephemeral) run — rendered with a Temp badge. */
export const tempSessionsSignal = signal<Set<string>>(new Set());

export function setTempSessions(ids: string[]): void {
  tempSessionsSignal.value = new Set(ids);
}

/** Replace the worktree map from a host `worktrees` push. */
export function setWorktrees(map: WorktreeMap): void {
  worktreesSignal.value = map;
}

/** The resolved worktree for a session, or undefined when it isn't in one. */
export function getWorktree(sessionId: string): WorktreeRef | undefined {
  return worktreesSignal.value[sessionId];
}

/**
 * repoRoot of the worktree the workspace itself lives in, or null. Single
 * source of truth for the repo-scoped "This Project" behaviour — read by
 * getFiltered, getProjectOptions, and the list/detail views so a worktree
 * session resolves the same way everywhere.
 */
export const currentRepoRootSignal = computed<string | null>(() =>
  currentRepoRoot(worktreesSignal.value, workspacePathSignal.value),
);

// ── Setters with derived side effects ──

/**
 * Set the workspace path and derive the (lowercased) current project name.
 * When no workspace is open the derived name is empty and getFiltered shows
 * all sessions — the filter selection itself is left untouched.
 */
export function setWorkspacePath(p: string): void {
  workspacePathSignal.value = p;
  const tail = p.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
  currentProjectSignal.value = tail.toLowerCase();
  // Do NOT mutate filterProjectSignal here. getFiltered already shows every
  // session when currentProject is empty (it narrows only when a project is
  // known), so an unresolved/empty workspace needs no filter change. Flipping
  // "current" -> "all" would be captured by the persistence effect and
  // durably corrupt the user's "This Project" choice on the common cold-start
  // race where workspaceFolders reads empty for one tick before resolving.
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
  // The scan for the live query has landed — stop the spinner. Stale replies
  // (guarded out above) leave the spinner running for the newer query.
  fullTextLoadingSignal.value = false;
}

/** Drop pending full-text hits — called when the query falls below the scan threshold. */
export function clearFullTextHits(): void {
  fullTextSignal.value = { query: "", ids: new Set() };
  fullTextLoadingSignal.value = false;
}

/** Signal that a host transcript scan has been dispatched for `query`. */
export function markFullTextLoading(): void {
  fullTextLoadingSignal.value = true;
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
  const worktrees = worktreesSignal.value;
  const worktreeFilter = filterWorktreeSignal.value;
  const repoRoot = currentRepoRootSignal.value;

  let list = all.filter((s) => !deleted.has(s.id));

  if (project === "current") {
    // Only narrow when the current scope is known; a cold-start race
    // (workspace not resolved yet) shows everything rather than an
    // empty list that reads like "no sessions". When the workspace is a
    // worktree, "current" spans the whole repo (every sibling worktree);
    // otherwise it narrows to the workspace project exactly as before.
    if (repoRoot) {
      list = list.filter((s) => worktrees[s.id]?.repoRoot === repoRoot);
    } else if (currentProject) {
      list = list.filter((s) => s.projectKey === currentProject);
    }
  } else if (project !== "all") {
    // A concrete selection is either a repoRoot (worktree repo, collapsed in
    // the dropdown) or a plain project name. Worktree sessions match their
    // repoRoot; everything else matches its project name (verbatim old rule).
    list = list.filter((s) => {
      const ref = worktrees[s.id];
      return ref ? ref.repoRoot === project : s.project === project;
    });
  }

  if (date === "week" || date === "month") {
    const now = Date.now();
    const cutoff = date === "week" ? now - 7 * 86400000 : now - 30 * 86400000;
    list = list.filter((s) => s.endTime >= cutoff || pinned.has(s.id));
  }

  if (branch !== "all") {
    // Branch is an explicit narrowing: show that branch only. Unlike the date
    // cutoff (which pins bypass so they don't age out), a pinned session on a
    // *different* branch must not leak into a branch view — that made the row
    // count exceed the branch dropdown's badge and surprised users who picked
    // a branch expecting just that branch.
    list = list.filter((s) => (s.branch || "(no branch)") === branch);
  }

  if (worktreeFilter !== "all") {
    // Narrow to a single worktree kind (main / claude / user). Sessions with no
    // ref match no concrete kind, so they only appear under "All checkouts".
    list = list.filter((s) => matchesWorktreeFilter(s, worktrees, worktreeFilter));
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

  // The "recent" view caps to the 20 newest non-pinned rows — but only when
  // NOT searching. A search that silently dropped the 21st+ match reads as
  // "search can't find it"; an active query must surface every match.
  if (date === "recent" && !query) {
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
    worktreesSignal.value,
    currentRepoRootSignal.value,
  );
}

/**
 * Worktree-kind filter options with per-kind counts. Thin signal-reading
 * wrapper over the pure `buildWorktreeOptions` lib helper.
 */
export function getWorktreeOptions(): WorktreeOption[] {
  return buildWorktreeOptions(sessionsSignal.value, deletedSignal.value, worktreesSignal.value);
}

/**
 * Whether the worktree filter is worth showing — true only when a Claude- or
 * user-created worktree session is present (mirrors the branch dropdown's
 * hide-when-nothing-to-filter rule).
 */
export function hasWorktreeSessions(): boolean {
  return hasWorktrees(sessionsSignal.value, deletedSignal.value, worktreesSignal.value);
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

/**
 * Memoized filtered list. `computed` recomputes only when a signal `getFiltered`
 * actually reads changes (session data + the filter/search signals) — NOT on
 * selection, bulk-mode, or context-menu re-renders, which don't touch those
 * inputs. Before this, ListView called getFiltered() in its render body, so
 * every checkbox click re-ran the full filter+sort over all N sessions.
 */
export const filteredSignal = computed(getFiltered);

/** Memoized header+session rows for the virtual list, derived from the
 *  filtered list + pins. Same memoization benefit as {@link filteredSignal}. */
export const rowsSignal = computed<Row[]>(() =>
  buildRows(filteredSignal.value, pinnedSignal.value),
);

/** Reactive count of the filtered list — handy for headers. */
export const filteredCount = computed(() => filteredSignal.value.length);

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

/**
 * Apply the host's configured `sessions.defaultFilter` / `defaultProject` as the
 * INITIAL filter values — but only for a dimension the user has not already
 * persisted an explicit choice for (a persisted selection always wins). Mirrors
 * v1 main.ts's `if (!hasPersistedFilterDate()) setFilterDate(defaultFilter)`.
 * Safe regardless of arrival order vs loadPersistedFilters: the guard checks
 * persisted state, not the live signal.
 */
export function applyDefaultFilters(defaultFilter?: string, defaultProject?: string): void {
  // Snapshot BOTH "unset" checks before mutating either signal. The active
  // persistence effect fires synchronously on the first mutation and writes
  // all three keys, so checking `project` after setting `date` would see a
  // freshly-persisted "current" and wrongly skip the configured defaultProject.
  const dateUnset = getPersisted<DateFilter>(PERSIST_KEY_FILTER_DATE) === undefined;
  const projectUnset = getPersisted<string>(PERSIST_KEY_FILTER_PROJECT) === undefined;
  if (defaultFilter && dateUnset) {
    filterDateSignal.value = defaultFilter as DateFilter;
  }
  if (defaultProject && projectUnset) {
    filterProjectSignal.value = defaultProject;
  }
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
  let primed = false;
  _persistDisposer = effect(() => {
    // Read all three up front so the effect subscribes to each signal — a
    // signals effect only tracks what it reads on the run that returns.
    const project = filterProjectSignal.value;
    const date = filterDateSignal.value;
    const branch = filterBranchSignal.value;
    // Skip the eager first run. `effect` invokes its body immediately on
    // creation; writing the current (default) values into persisted state
    // before the host's `settings` message arrives would make every key
    // "defined", defeating applyDefaultFilters's "persisted wins" guard and
    // silently killing the `sessions.defaultFilter` / `defaultProject`
    // settings. Only genuine user changes (subsequent runs) get persisted.
    if (!primed) {
      primed = true;
      return;
    }
    setPersisted(PERSIST_KEY_FILTER_PROJECT, project);
    setPersisted(PERSIST_KEY_FILTER_DATE, date);
    setPersisted(PERSIST_KEY_FILTER_BRANCH, branch);
  });
}

/** Stop persisting filter changes. Returns the signals to non-persisting state. */
export function stopFilterPersistence(): void {
  _persistDisposer?.();
  _persistDisposer = null;
}

/** Reset all signals to defaults. Test-only helper. */
export function _resetSessionsSignals(): void {
  loadedSignal.value = false;
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
  fullTextLoadingSignal.value = false;
  filterProjectSignal.value = "current";
  filterDateSignal.value = "recent";
  filterBranchSignal.value = "all";
  filterWorktreeSignal.value = "all";
  worktreesSignal.value = {};
  workspacePathSignal.value = "";
  currentProjectSignal.value = "";
  currentBranchSignal.value = "";
  bulkModeSignal.value = false;
  selectionSignal.value = new Set();
  restoreWindowMinutesSignal.value = 30;
  openTerminalsSignal.value = new Set();
  tempSessionsSignal.value = new Set();
}
