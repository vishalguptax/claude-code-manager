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
  type FilterScope,
  buildBranchOptions,
  buildProjectOptions,
  buildRows,
  buildWorktreeOptions,
  currentRepoRoot,
  hasWorktrees,
  isVolatileLabel,
  listBranches,
  matchesProject,
  matchesScope,
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
/** Session IDs the user archived, from the host's userState message. */
export const archivedSignal = signal<Set<string>>(new Set());
/** When on, the list shows the archive instead of the live sessions. */
export const showArchivedSignal = signal(false);
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
/**
 * Minimum query length before asking the host for a transcript scan. Below
 * this, metadata matches from `searchHaystack` are enough and a host scan
 * returns thousands of low-value hits.
 *
 * Lives in the model because two callers must agree on it: the search box that
 * issues the scan, and the index-ready handler that re-issues it.
 */
export const FULLTEXT_MIN_CHARS = 2;
/**
 * False until the host reports its transcript index finished building. A scan
 * answered before this is true saw a partial corpus, so its result is not
 * final — {@link searchPendingSignal} keeps the spinner up to say so.
 */
export const searchIndexReadySignal = signal<boolean>(false);
/**
 * True while transcript results for the live query may still change: either a
 * scan is in flight, or the index behind it is still filling.
 */
export const searchPendingSignal = computed<boolean>(
  () =>
    fullTextLoadingSignal.value ||
    (searchQuerySignal.value.length >= FULLTEXT_MIN_CHARS && !searchIndexReadySignal.value),
);

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

/** How many recent sessions the Restore action reopens. */
export const restoreCountSignal = signal<number>(4);

/**
 * Section labels the user has collapsed in the list. Keyed by label rather than
 * by index so the choice survives new sessions arriving, a re-filter, and the
 * day ladder re-bucketing overnight.
 */
export const collapsedGroupsSignal = signal<Set<string>>(new Set());

/** Collapse or expand one list section. */
export function toggleGroupCollapsed(label: string): void {
  const next = new Set(collapsedGroupsSignal.value);
  if (!next.delete(label)) next.add(label);
  collapsedGroupsSignal.value = next;
}

/**
 * Collapse or expand every section at once.
 *
 * Takes the labels explicitly rather than reading the rows itself: only the
 * sections currently on screen should be touched, and a label the filters have
 * hidden must keep whatever state the user last gave it. Collapsing everything
 * while a filter is narrow would otherwise silently collapse sections the user
 * cannot even see, and they would find them folded when the filter cleared.
 */
export function setGroupsCollapsed(labels: readonly string[], collapsed: boolean): void {
  const next = new Set(collapsedGroupsSignal.value);
  for (const label of labels) {
    if (collapsed) next.add(label);
    else next.delete(label);
  }
  collapsedGroupsSignal.value = next;
}

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

/** Replace archived ids from a host userState message. */
export function setArchived(ids: string[]): void {
  archivedSignal.value = new Set(ids);
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

/** Record that the host's transcript index finished building. */
export function markSearchIndexReady(): void {
  searchIndexReadySignal.value = true;
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

  // Project / date / branch / worktree all live in `matchesScope`, which the
  // filter dropdowns read too. Keeping one definition is what stops the
  // counts in those dropdowns from describing a different list than this one.
  let list = all.filter((s) => matchesScope(s, currentScope()));

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
 * Snapshot every filter dimension into the shared {@link FilterScope} the
 * list and the dropdowns both evaluate against.
 */
export function currentScope(): FilterScope {
  return {
    deleted: deletedSignal.value,
    pinned: pinnedSignal.value,
    archived: archivedSignal.value,
    showArchived: showArchivedSignal.value,
    project: filterProjectSignal.value,
    currentProject: currentProjectSignal.value,
    date: filterDateSignal.value,
    branch: filterBranchSignal.value,
    worktree: filterWorktreeSignal.value,
    worktrees: worktreesSignal.value,
    repoRoot: currentRepoRootSignal.value,
    now: Date.now(),
  };
}

/**
 * The last working set — the `restoreCount` most recently active sessions in
 * the current scope, oldest-first so terminals reopen in start order. Backs
 * the Restore action.
 *
 * Count-based, not time-based: the previous rule kept only sessions ending
 * within `restoreWindowMinutes` of the *newest* one, so a normal workday (one
 * session this morning, the rest yesterday evening) collapsed to a single
 * session and Restore opened one terminal. A fixed count always reopens a
 * usable working set.
 *
 * Scope matches getFiltered's "This Project": when the workspace is a
 * worktree, the whole repo (every sibling worktree) counts; otherwise the
 * workspace project. Restore used a bare projectKey match, which silently
 * excluded sibling-worktree sessions the list was showing.
 */
export function getLastSessionGroup(): Session[] {
  const deleted = deletedSignal.value;
  const currentProject = currentProjectSignal.value;
  const repoRoot = currentRepoRootSignal.value;
  const worktrees = worktreesSignal.value;

  let candidates = sessionsSignal.value.filter((s) => !deleted.has(s.id));
  if (repoRoot) {
    candidates = candidates.filter((s) => worktrees[s.id]?.repoRoot === repoRoot);
  } else if (currentProject) {
    candidates = candidates.filter((s) => s.projectKey === currentProject);
  }

  return candidates
    .slice()
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, Math.max(1, restoreCountSignal.value))
    .reverse();
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
  return buildProjectOptions(sessionsSignal.value, currentScope());
}

/**
 * Worktree-kind filter options with per-kind counts. Thin signal-reading
 * wrapper over the pure `buildWorktreeOptions` lib helper.
 */
export function getWorktreeOptions(): WorktreeOption[] {
  const scope = currentScope();
  return buildWorktreeOptions(sessionsSignal.value, scope.worktrees, (s) =>
    matchesScope(s, scope, "worktree"),
  );
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
    currentBranchSignal.value,
    currentScope(),
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
 *  filtered list + pins. Same memoization benefit as {@link filteredSignal}.
 *
 *  A search produces a FLAT list: the Active / Today / Pinned / date sections
 *  answer "what have I been working on", which is a question the user stopped
 *  asking the moment they typed a query. Under search they only fragment the
 *  result set — a three-hit search could arrive as three one-row sections, and
 *  a collapsed section would silently hide a match. Results stay in the
 *  filtered order (pinned first, then most recent). */
export const rowsSignal = computed<Row[]>(() => {
  const list = filteredSignal.value;
  if (searchQuerySignal.value) return list.map((session): Row => ({ kind: "session", session }));
  // `now` comes from the clock here rather than being threaded through: the
  // list re-derives on every session/filter change anyway, so the day buckets
  // refresh on the next interaction after midnight.
  return buildRows(list, pinnedSignal.value, collapsedGroupsSignal.value, Date.now());
});

/** Reactive count of the filtered list — handy for headers. */
export const filteredCount = computed(() => filteredSignal.value.length);

/** Labels of the sections currently on screen, in display order. */
export const groupLabelsSignal = computed<string[]>(() =>
  rowsSignal.value.flatMap((r) => (r.kind === "header" ? [r.label] : [])),
);

/**
 * True when every section on screen is collapsed, so one control can both
 * fold and unfold. Vacuously false with no sections at all — there is nothing
 * to unfold, and the control hides in that case anyway.
 */
export const allGroupsCollapsed = computed<boolean>(() => {
  const labels = groupLabelsSignal.value;
  if (labels.length === 0) return false;
  const collapsed = collapsedGroupsSignal.value;
  return labels.every((l) => collapsed.has(l));
});

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
const PERSIST_KEY_COLLAPSED = "sessions.collapsedGroups";

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

  const collapsed = getPersisted<string[]>(PERSIST_KEY_COLLAPSED);
  if (Array.isArray(collapsed)) {
    // Drop volatile labels on the way in as well as on the way out. A build
    // that persisted "Today" before this filter existed must not keep hiding
    // today's work forever.
    collapsedGroupsSignal.value = new Set(collapsed.filter((l) => !isVolatileLabel(l)));
  }
}

/**
 * Apply the host's configured `sessions.defaultFilter` / `defaultProject` as the
 * INITIAL filter values — but only for a dimension the user has not already
 * persisted an explicit choice for (a persisted selection always wins). Mirrors
 * v1 main.ts's `if (!hasPersistedFilterDate()) setFilterDate(defaultFilter)`.
 * Safe regardless of arrival order vs loadPersistedFilters: the guard checks
 * persisted state, not the live signal.
 */
/**
 * The date and project filters the host says are this user's defaults, from
 * `claudeManager.sessions.defaultFilter` / `defaultProject`.
 *
 * The active-filter chips compare against THESE, not against a hardcoded
 * "widest" value. A chip means "you have narrowed past your own default", so a
 * user who set Recent + This Project as their defaults sees no chips at rest —
 * which is the whole reason the chip row can replace three permanent rows of
 * pickers. Comparing against "all" instead would put two chips on screen for
 * everyone, permanently, which is just the old filter row with fewer controls.
 */
export const defaultDateSignal = signal<DateFilter>("recent");
export const defaultProjectSignal = signal<string>("current");

export function applyDefaultFilters(defaultFilter?: string, defaultProject?: string): void {
  if (defaultFilter) defaultDateSignal.value = defaultFilter as DateFilter;
  if (defaultProject) defaultProjectSignal.value = defaultProject;
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

/**
 * Drop a persisted project / branch selection that no longer matches anything.
 *
 * Both are stored verbatim and survive reloads, so a selection can outlive the
 * data behind it: a branch that only existed in another repo, or — because the
 * project dropdown keys its options by repoRoot once the deferred `worktrees`
 * message resolves, and by plain project name before that — a project value
 * chosen in the window before resolution. The list then renders empty with no
 * indication why, and no amount of reopening fixes it because the dead value
 * is what gets restored.
 *
 * Called after sessions and worktrees land. "current"/"all" are always valid.
 */
export function pruneUnmatchedFilters(): void {
  const sessions = sessionsSignal.value;
  if (sessions.length === 0) return;

  const project = filterProjectSignal.value;
  if (project !== "current" && project !== "all") {
    const scope = { ...currentScope(), project };
    if (!sessions.some((s) => matchesProject(s, scope))) {
      filterProjectSignal.value = "current";
    }
  }

  const branch = filterBranchSignal.value;
  if (branch !== "all") {
    const inScope = { ...currentScope(), branch: "all" };
    const reachable = sessions.some(
      (s) =>
        matchesScope(s, inScope, "branch") &&
        (s.branch || "(no branch)") === branch,
    );
    if (!reachable) filterBranchSignal.value = "all";
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
    const collapsed = collapsedGroupsSignal.value;
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
    // Volatile labels are session-only: persisting a collapsed "Today" would
    // hide tomorrow's work behind a preference set about today's.
    setPersisted(
      PERSIST_KEY_COLLAPSED,
      [...collapsed].filter((l) => !isVolatileLabel(l)),
    );
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
  archivedSignal.value = new Set();
  showArchivedSignal.value = false;
  detailSignal.value = null;
  detailLoadingSignal.value = false;
  viewSignal.value = "list";
  selectedIdSignal.value = null;
  searchQuerySignal.value = "";
  fullTextSignal.value = { query: "", ids: new Set() };
  fullTextLoadingSignal.value = false;
  searchIndexReadySignal.value = false;
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
  collapsedGroupsSignal.value = new Set();
  restoreCountSignal.value = 4;
  openTerminalsSignal.value = new Set();
  tempSessionsSignal.value = new Set();
}
