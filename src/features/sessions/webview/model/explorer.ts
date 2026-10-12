/**
 * State and actions of the sessions explorer tab.
 *
 * The explorer reads the same session, pin, archive and folder signals as
 * the sidebar — the host pushes the same messages to every webview — and its
 * search IS the sidebar's search machinery (`searchQuerySignal` and the
 * host's full-text hits), which in this document no list but the explorer
 * reads. What lives here is the explorer's own state: where it is, what is
 * selected, and how the user likes it laid out.
 */
import { computed, effect, signal } from "@preact/signals";
import { getPersisted, setPersisted } from "../../../../webview/persistence";
import {
  sendArchiveSessions,
  sendBulkDeleteSessions,
  sendBulkExportSessions,
  sendBulkPinSessions,
  sendFileSessions,
  sendMoveToFolder,
  sendOpenSessionPanel,
  sendRemoveFolder,
  sendRenameFolder,
  sendRenameSession,
  sendUnarchiveSession,
} from "../api";
import {
  type ExplorerInput,
  type ExplorerItem,
  type ExplorerLocation,
  type ExplorerSort,
  HOME,
  type ProjectOption,
  buildItems,
  buildProjectOptions,
  locationCounts,
  matchesProject,
  rangeKeys,
  sameLocation,
} from "../lib";
import { applySearchQuery } from "./search";
import {
  archivedSignal,
  currentScope,
  deletedSignal,
  folderNamesSignal,
  foldersSignal,
  fullTextSignal,
  pinnedSignal,
  searchQuerySignal,
  sessionsSignal,
} from "./signals";

export type ExplorerViewMode = "details" | "tiles";

// ── Where the explorer is ──

export const explorerLocationSignal = signal<ExplorerLocation>(HOME);
/** Locations to return to with Back, most recent last. */
export const explorerHistorySignal = signal<ExplorerLocation[]>([]);
/**
 * The project filter. Starts on the workspace's project, like the sidebar:
 * the explorer opens from a workspace, and that project is what you came to
 * organize. "all" or a project / repo root otherwise (see `matchesProject`).
 */
export const explorerProjectSignal = signal("current");

// ── What is selected ──

/** Item keys (`folder:<name>` / `session:<id>`) currently selected. */
export const explorerSelectionSignal = signal<Set<string>>(new Set());
/** Where the next Shift range starts: the last item clicked without Shift. */
export const explorerAnchorSignal = signal<string | null>(null);
/** The item keyboard navigation moves from, and the preview pane shows. */
export const explorerFocusSignal = signal<string | null>(null);

// ── How it is laid out (persisted per tab) ──

export const explorerViewModeSignal = signal<ExplorerViewMode>("details");
export const explorerPreviewOpenSignal = signal(true);
export const explorerSortSignal = signal<ExplorerSort>({ key: "modified", dir: "desc" });

const PERSIST_VIEW = "explorer.viewMode";
const PERSIST_PREVIEW = "explorer.previewOpen";
const PERSIST_SORT = "explorer.sort";
const PERSIST_LOCATION = "explorer.location";
const PERSIST_PROJECT = "explorer.project";
const SORT_KEYS: readonly string[] = ["name", "project", "modified", "messages"];

/** A saved location, if it still has a shape this version understands. */
function readLocation(raw: unknown): ExplorerLocation | null {
  if (typeof raw !== "object" || raw === null) return null;
  const loc = raw as { kind?: unknown; name?: unknown };
  if (loc.kind === "folder") return typeof loc.name === "string" ? { kind: "folder", name: loc.name } : null;
  if (loc.kind === "home" || loc.kind === "all" || loc.kind === "pinned" || loc.kind === "archived") {
    return { kind: loc.kind };
  }
  return null;
}

/**
 * Restore what the tab was showing, then keep it saved. Returns the stop
 * handle.
 *
 * Location and project are saved, not just the layout, because VS Code
 * reloads an editor tab's document every time the tab is shown again after
 * being hidden: without them, glancing at a file and coming back dropped you
 * out of the folder you were in. The selection and the search are left out —
 * a file manager does not keep those across a revisit either.
 *
 * The effect's first run only reads (and so subscribes); writing the values
 * just restored straight back would change nothing.
 */
export function initExplorerPersistence(): () => void {
  const view = getPersisted<ExplorerViewMode>(PERSIST_VIEW);
  if (view === "details" || view === "tiles") explorerViewModeSignal.value = view;
  const preview = getPersisted<boolean>(PERSIST_PREVIEW);
  if (typeof preview === "boolean") explorerPreviewOpenSignal.value = preview;
  const sort = getPersisted<ExplorerSort>(PERSIST_SORT);
  if (sort && SORT_KEYS.includes(sort.key) && (sort.dir === "asc" || sort.dir === "desc")) {
    explorerSortSignal.value = sort;
  }
  const location = readLocation(getPersisted(PERSIST_LOCATION));
  if (location) explorerLocationSignal.value = location;
  const project = getPersisted<string>(PERSIST_PROJECT);
  if (typeof project === "string" && project) explorerProjectSignal.value = project;

  let first = true;
  return effect(() => {
    const v = explorerViewModeSignal.value;
    const p = explorerPreviewOpenSignal.value;
    const s = explorerSortSignal.value;
    const l = explorerLocationSignal.value;
    const pr = explorerProjectSignal.value;
    if (first) {
      first = false;
      return;
    }
    setPersisted(PERSIST_VIEW, v);
    setPersisted(PERSIST_PREVIEW, p);
    setPersisted(PERSIST_SORT, s);
    setPersisted(PERSIST_LOCATION, l);
    setPersisted(PERSIST_PROJECT, pr);
  });
}

// ── Derived ──

/**
 * The location actually shown. A folder renamed or removed — here or from
 * the sidebar — no longer exists; showing it as empty would read as "your
 * sessions are gone", so the explorer falls back home.
 */
export const effectiveLocationSignal = computed<ExplorerLocation>(() => {
  const loc = explorerLocationSignal.value;
  if (loc.kind === "folder" && !folderNamesSignal.value.includes(loc.name)) return HOME;
  return loc;
});

const inputSignal = computed<ExplorerInput>(() => {
  // Only the project dimension of the sidebar's scope applies here; the
  // explorer has no date, branch or worktree filter.
  const scope = { ...currentScope(), project: explorerProjectSignal.value };
  const query = searchQuerySignal.value;
  const ft = fullTextSignal.value;
  return {
    sessions: sessionsSignal.value,
    folderNames: folderNamesSignal.value,
    folders: foldersSignal.value,
    pinned: pinnedSignal.value,
    archived: archivedSignal.value,
    deleted: deletedSignal.value,
    inProject: (s) => matchesProject(s, scope),
    query,
    hits: ft.query === query ? ft.ids : null,
  };
});

export const explorerItemsSignal = computed<ExplorerItem[]>(() =>
  buildItems(inputSignal.value, effectiveLocationSignal.value, explorerSortSignal.value),
);

export const explorerCountsSignal = computed(() => locationCounts(inputSignal.value));

/** Project filter options with counts, "This Project" and "All Projects" first. */
export const explorerProjectOptionsSignal = computed<ProjectOption[]>(() =>
  buildProjectOptions(sessionsSignal.value, {
    ...currentScope(),
    project: explorerProjectSignal.value,
    date: "all",
    branch: "all",
    worktree: "all",
    showArchived: false,
  }),
);

/** The selected items, in display order. */
export const selectedItemsSignal = computed<ExplorerItem[]>(() => {
  const sel = explorerSelectionSignal.value;
  return explorerItemsSignal.value.filter((i) => sel.has(i.key));
});

/** Ids of the selected sessions — what the session commands act on. */
export const selectedSessionIdsSignal = computed<string[]>(() =>
  selectedItemsSignal.value.flatMap((i) => (i.kind === "session" ? [i.session.id] : [])),
);

export const focusedItemSignal = computed<ExplorerItem | null>(() => {
  const key = explorerFocusSignal.value;
  return key === null ? null : (explorerItemsSignal.value.find((i) => i.key === key) ?? null);
});

// ── Navigation ──

function clearSelectionState(): void {
  explorerSelectionSignal.value = new Set();
  explorerAnchorSignal.value = null;
  explorerFocusSignal.value = null;
}

/**
 * Go somewhere. Like a file manager, arriving clears the selection and the
 * search: both described the place you left.
 */
export function navigate(to: ExplorerLocation): void {
  const from = effectiveLocationSignal.value;
  if (sameLocation(from, to)) return;
  explorerHistorySignal.value = [...explorerHistorySignal.value, from];
  explorerLocationSignal.value = to;
  clearSelectionState();
  if (searchQuerySignal.value) applySearchQuery("");
}

export function goBack(): void {
  const history = explorerHistorySignal.value;
  const to = history[history.length - 1];
  if (!to) return;
  explorerHistorySignal.value = history.slice(0, -1);
  explorerLocationSignal.value = to;
  clearSelectionState();
  if (searchQuerySignal.value) applySearchQuery("");
}

/** Up one level: everything but home sits directly under home. */
export function goUp(): void {
  if (effectiveLocationSignal.value.kind !== "home") navigate(HOME);
}

// ── Selection ──

/**
 * An item click, with file-manager semantics: a plain click selects just
 * that item, Cmd/Ctrl-click toggles it, Shift-click selects the range from
 * the anchor. The clicked item takes the focus either way.
 */
export function clickItem(key: string, mods: { toggle: boolean; range: boolean }): void {
  const keys = explorerItemsSignal.value.map((i) => i.key);
  if (mods.range) {
    explorerSelectionSignal.value = new Set(rangeKeys(keys, explorerAnchorSignal.value, key));
  } else if (mods.toggle) {
    const next = new Set(explorerSelectionSignal.value);
    if (!next.delete(key)) next.add(key);
    explorerSelectionSignal.value = next;
    explorerAnchorSignal.value = key;
  } else {
    explorerSelectionSignal.value = new Set([key]);
    explorerAnchorSignal.value = key;
  }
  explorerFocusSignal.value = key;
}

/**
 * A right-click selects the item first unless it is already part of the
 * selection — so the menu always acts on what is highlighted.
 */
export function contextSelect(key: string): void {
  if (!explorerSelectionSignal.value.has(key)) clickItem(key, { toggle: false, range: false });
}

export function clearExplorerSelection(): void {
  clearSelectionState();
}

export function selectAllItems(): void {
  const keys = explorerItemsSignal.value.map((i) => i.key);
  explorerSelectionSignal.value = new Set(keys);
  if (explorerFocusSignal.value === null && keys.length > 0) explorerFocusSignal.value = keys[0];
}

/**
 * Move the focus `delta` items (1 / -1 in a list; ±columns across a grid),
 * clamped to the ends. Without `extend` the selection follows the focus;
 * with it (Shift) the selection grows from the anchor.
 */
export function moveFocus(delta: number, extend: boolean): void {
  const keys = explorerItemsSignal.value.map((i) => i.key);
  if (keys.length === 0) return;
  const at = explorerFocusSignal.value === null ? -1 : keys.indexOf(explorerFocusSignal.value);
  const next =
    at < 0 ? (delta > 0 ? 0 : keys.length - 1) : Math.max(0, Math.min(keys.length - 1, at + delta));
  focusIndex(next, extend);
}

/** Focus the item at `index` (Home / End), selecting as {@link moveFocus} does. */
export function focusIndex(index: number, extend: boolean): void {
  const keys = explorerItemsSignal.value.map((i) => i.key);
  const key = keys[index];
  if (key === undefined) return;
  if (extend) {
    const anchor = explorerAnchorSignal.value ?? explorerFocusSignal.value ?? key;
    explorerAnchorSignal.value = anchor;
    explorerSelectionSignal.value = new Set(rangeKeys(keys, anchor, key));
  } else {
    explorerSelectionSignal.value = new Set([key]);
    explorerAnchorSignal.value = key;
  }
  explorerFocusSignal.value = key;
}

/**
 * The session ids a drag from `key` carries: every selected session when the
 * dragged item is selected (dragging one of five highlighted rows moves all
 * five), otherwise just that one.
 */
export function dragSessionIds(key: string): string[] {
  if (explorerSelectionSignal.value.has(key)) return selectedSessionIdsSignal.value;
  const item = explorerItemsSignal.value.find((i) => i.key === key);
  return item?.kind === "session" ? [item.session.id] : [];
}

// ── Drag and drop ──

/** True when dropping sessions on `loc` means something (All does not). */
export function canDropOn(loc: ExplorerLocation): boolean {
  return loc.kind !== "all";
}

/**
 * Drop sessions on a location: file them into a folder, take them out of
 * every folder (Sessions), pin them (Pinned) or archive them (Archived).
 */
export function dropOnLocation(loc: ExplorerLocation, ids: string[]): void {
  if (ids.length === 0) return;
  switch (loc.kind) {
    case "folder":
      sendFileSessions(ids, loc.name);
      break;
    case "home":
      sendFileSessions(ids, "");
      break;
    case "pinned":
      sendBulkPinSessions(ids, true);
      break;
    case "archived":
      sendArchiveSessions(ids);
      break;
    case "all":
      break;
  }
}

// ── Commands ──

/** Enter / double-click: step into a folder, or open a session in its own tab. */
export function openItem(item: ExplorerItem): void {
  if (item.kind === "folder") navigate({ kind: "folder", name: item.name });
  else sendOpenSessionPanel(item.session.id);
}

export function openFocused(): void {
  const item = focusedItemSignal.value;
  if (item) openItem(item);
}

/** F2: rename the focused folder or session (the host asks for the name). */
export function renameFocused(): void {
  const item = focusedItemSignal.value;
  if (!item) return;
  if (item.kind === "folder") sendRenameFolder(item.name);
  else sendRenameSession(item.session.id);
}

export function moveSelection(): void {
  const ids = selectedSessionIdsSignal.value;
  if (ids.length > 0) sendMoveToFolder(ids);
}

/** Pin the selection, or unpin it when every selected session is pinned. */
export function togglePinSelection(): void {
  const ids = selectedSessionIdsSignal.value;
  if (ids.length === 0) return;
  const pinned = pinnedSignal.value;
  sendBulkPinSessions(ids, !ids.every((id) => pinned.has(id)));
}

/** Archive the selection — or, in the Archived view, restore it. */
export function toggleArchiveSelection(): void {
  const ids = selectedSessionIdsSignal.value;
  if (ids.length === 0) return;
  if (effectiveLocationSignal.value.kind === "archived") {
    for (const id of ids) sendUnarchiveSession(id);
  } else {
    sendArchiveSessions(ids);
  }
}

export function exportSelection(): void {
  const ids = selectedSessionIdsSignal.value;
  if (ids.length > 0) sendBulkExportSessions(ids);
}

/**
 * Delete what is selected. Sessions go through the host's confirm; folders
 * are removed outright, because removing a folder deletes nothing — its
 * sessions return to the home location.
 */
export function deleteSelection(): void {
  const items = selectedItemsSignal.value;
  for (const item of items) if (item.kind === "folder") sendRemoveFolder(item.name);
  const ids = selectedSessionIdsSignal.value;
  if (ids.length > 0) sendBulkDeleteSessions(ids);
}

/**
 * The explorer's keyboard map, for the content pane. `columns` is how many
 * items sit on a row (1 in the details view), so Up / Down move a whole row
 * of tiles. Returns true when the key was handled.
 */
export function handleExplorerKey(
  e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey">,
  columns: number,
): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey && e.key === "ArrowUp") return goUp(), true;
  if (e.altKey && e.key === "ArrowLeft") return goBack(), true;
  switch (e.key) {
    case "ArrowDown":
      return moveFocus(columns, e.shiftKey), true;
    case "ArrowUp":
      return moveFocus(-columns, e.shiftKey), true;
    case "ArrowRight":
      return columns > 1 ? (moveFocus(1, e.shiftKey), true) : false;
    case "ArrowLeft":
      return columns > 1 ? (moveFocus(-1, e.shiftKey), true) : false;
    case "Home":
      return focusIndex(0, e.shiftKey), true;
    case "End":
      return focusIndex(explorerItemsSignal.value.length - 1, e.shiftKey), true;
    case "Enter":
      return openFocused(), true;
    case "F2":
      return renameFocused(), true;
    case "Delete":
      return deleteSelection(), true;
    case "Backspace":
      // Cmd+Backspace is macOS's delete; a bare Backspace goes up a level.
      if (mod) deleteSelection();
      else goUp();
      return true;
    case "Escape":
      return clearExplorerSelection(), true;
    case "a":
    case "A":
      return mod ? (selectAllItems(), true) : false;
    default:
      return false;
  }
}

/** Reset the explorer's state. Test-only helper. */
export function _resetExplorer(): void {
  explorerLocationSignal.value = HOME;
  explorerHistorySignal.value = [];
  explorerProjectSignal.value = "current";
  explorerViewModeSignal.value = "details";
  explorerPreviewOpenSignal.value = true;
  explorerSortSignal.value = { key: "modified", dir: "desc" };
  clearSelectionState();
}
