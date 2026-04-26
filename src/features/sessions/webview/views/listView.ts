/**
 * List view -- the main session list with search, filter, date chips,
 * quick actions bar, and footer. Uses extracted components for rendering.
 */

import { icon } from "../../../../webview/icons";
import { esc, dateLabel, renderEmptyState } from "../../../../webview/utils";
import {
  sendNewSession,
  sendContinueLastSession,
  sendResumeSession,
  sendResumeMultiple,
  sendRefresh,
  sendGetSessionDetail,
  sendImportSession,
  sendBulkPinSessions,
  sendBulkDeleteSessions,
  sendBulkExportSessions,
} from "../api";
import {
  getAllSessions,
  getPinnedIds,
  getFiltered,
  getLastSessionGroup,
  getSearchQuery,
  getSelectedId,
  getVisibleCount,
  incrementVisibleCount,
  setSelectedId,
  setDetailSearchQuery,
  setLoading,
  setView,
  setShellMounted,
  getSelectedSet,
  isSelected,
  selectionCount,
  toggleSelected,
  clearSelection,
  selectAll,
  setSelectedRange,
  getSelectAnchor,
  isBulkMode,
  setBulkMode,
} from "../state";
import type { Session } from "../../types";
import { showDetail } from "./detailView";
import { showContextMenu } from "../components/contextMenu";
import { renderSearchBar, bindSearchBar } from "../components/searchBar";
import { renderDropdown, bindDropdown, updateDropdown } from "../components/dropdown";
import {
  renderBranchDropdown,
  bindBranchDropdown,
  updateBranchDropdown,
} from "../components/branchDropdown";
import { renderDateChips, bindDateChips } from "../components/dateChips";
import { renderSessionItem, bindSessionItems } from "../components/sessionItem";

/**
 * Build the initial shell HTML for the list view and wire up all
 * static event listeners (search, actions bar, date chips, footer links).
 * Called once when the first batch of sessions arrives.
 */
export function mountShell(): void {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = `
    <div class="panel" id="listView">
      <div class="actions-bar">
        <button class="action-btn" id="actNew" title="Start a new Claude Code session in a fresh terminal">${icon("plus")} New</button>
        <button class="action-btn" id="actContinue" title="Continue your most recent Claude session in this workspace (claude --continue)">${icon("history")} Continue</button>
        <button class="action-btn" id="actAll" title="Reopen all terminals from your last working session">${icon("split-square-horizontal")} Restore Workspace</button>
        <button class="action-btn" id="actImport" title="Import a session exported from another machine">${icon("download")} Import</button>
      </div>
      ${renderSearchBar()}
      <div class="filter-row">
        ${renderDropdown()}
        ${renderBranchDropdown()}
      </div>
      ${renderDateChips()}
      <div id="sessionList" class="list"></div>
    </div>
    <div class="panel hidden" id="detailView"></div>`;

  bindSearchBar(updateList);
  bindDropdown();
  bindBranchDropdown();
  bindDateChips(updateList);

  document.getElementById("actNew")?.addEventListener("click", () => sendNewSession());
  document.getElementById("actContinue")?.addEventListener("click", () => sendContinueLastSession());
  document.getElementById("actAll")?.addEventListener("click", () => {
    const lastGroup = getLastSessionGroup();
    if (lastGroup.length) {
      sendResumeMultiple(lastGroup.map((s) => s.id), lastGroup.map((s) => s.projectPath));
    }
  });
  document.getElementById("actImport")?.addEventListener("click", () => sendImportSession());
  document.getElementById("sessionsRefresh")?.addEventListener("click", () => sendRefresh());

  // Event delegation on session list — bind once, survives innerHTML updates
  const sessionList = document.getElementById("sessionList");
  if (sessionList) {
    bindSessionItems(sessionList, getPinnedIds, {
      onSelect: (id: string) => {
        setSelectedId(id);
        setLoading(true);
        showDetail();
        sendGetSessionDetail(id);
      },
      onContextMenu: (e: MouseEvent, id: string, isPinned: boolean) => {
        showContextMenu(e, id, isPinned);
      },
      onResume: (id: string) => {
        const s = getAllSessions().find((x) => x.id === id);
        if (s) sendResumeSession(id, s.entrypoint, s.projectPath);
      },
      isBulkMode,
      onSelectionToggle: (id: string, range: boolean) => {
        // Range selection extends from the current anchor through the
        // visible filtered list to the clicked id. We compute on the
        // visible slice (`getFiltered().slice(0, visibleCount)`) so a
        // shift-click never reaches into rows the user can't see.
        if (range) {
          const anchor = getSelectAnchor();
          if (anchor) {
            const visible = getFiltered().slice(0, getVisibleCount()).map((s) => s.id);
            const a = visible.indexOf(anchor);
            const b = visible.indexOf(id);
            if (a >= 0 && b >= 0) {
              const [lo, hi] = a < b ? [a, b] : [b, a];
              setSelectedRange(visible.slice(lo, hi + 1));
              updateList();
              return;
            }
          }
        }
        toggleSelected(id);
        updateList();
      },
    });

    // "Show more" also via delegation (button is re-created on each render)
    sessionList.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.id === "showMore" || target.closest("#showMore")) {
        incrementVisibleCount(30);
        updateList();
      }
    });
  }

  // Ctrl/Cmd+A while the list view is the active panel and bulk
  // mode is engaged selects every currently visible row. Scoped to
  // bulk mode so users typing in the search input still get the
  // native select-all behaviour they expect.
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "a") return;
    if (!isBulkMode()) return;
    const tag = (e.target as HTMLElement | null)?.tagName ?? "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const listView = document.getElementById("listView");
    if (!listView || listView.classList.contains("hidden")) return;
    e.preventDefault();
    const visible = getFiltered().slice(0, getVisibleCount()).map((s) => s.id);
    selectAll(visible);
    updateList();
  });

  setShellMounted(true);
}

/**
 * Refresh both dropdowns and the list. Used as the project dropdown's
 * onUpdate so that picking a different project immediately:
 *   1. resets `filterBranch` to "all" (see dropdown.ts)
 *   2. rebuilds the branch menu with the new project's branches
 *   3. re-renders the session list
 * Without the branch rebuild, a branch from the old project could linger
 * in the menu even though it has zero matching sessions.
 */
function onProjectFilterChange(): void {
  updateBranchDropdown(updateList);
  updateList();
}

/**
 * Rebuild both filter dropdown menus to reflect current sessions and
 * counts. Called after every sessions/userState/workspaceBranch message
 * so labels and counts track the latest data.
 */
export function updateFilter(): void {
  updateDropdown(onProjectFilterChange);
  updateBranchDropdown(updateList);
}

/**
 * Build the markup for the count row. In normal mode it's just the
 * "N sessions" label plus a "Select" toggle that flips the list
 * into bulk mode. In bulk mode the row turns into a compact
 * toolbar: count of selected rows + Pin/Unpin / Export / Delete /
 * Cancel. Inline render keeps the toolbar pinned to the same
 * vertical slot the count occupied so the list does not jump.
 */
function renderCountRow(totalCount: number): string {
  if (!isBulkMode()) {
    return `
      <div class="list-count">
        <span class="list-count-label">${totalCount} session${totalCount !== 1 ? "s" : ""}</span>
        <button class="list-count-toggle" id="bulkEnter" title="Enter bulk-select mode">${icon("check", 12)} Select</button>
      </div>`;
  }
  const sel = getSelectedSet();
  const pinned = getPinnedIds();
  let allPinned = sel.size > 0;
  for (const id of sel) {
    if (!pinned.has(id)) { allPinned = false; break; }
  }
  const pinLabel = allPinned ? "Unpin" : "Pin";
  const pinIcon = allPinned ? "pin-off" : "pin";
  const count = sel.size;
  const disabled = count === 0 ? "disabled" : "";
  return `
    <div class="list-count list-count-bulk">
      <span class="list-count-label">${count} selected</span>
      <button class="bulk-btn" id="bulkPin" ${disabled}>${icon(pinIcon, 12)} ${pinLabel}</button>
      <button class="bulk-btn" id="bulkExport" ${disabled}>${icon("download", 12)} Export</button>
      <button class="bulk-btn del" id="bulkDelete" ${disabled}>${icon("trash-2", 12)} Delete</button>
      <button class="bulk-btn" id="bulkCancel" title="Exit bulk mode">${icon("x", 12)} Cancel</button>
    </div>`;
}

function bindCountRow(): void {
  const enter = document.getElementById("bulkEnter");
  if (enter) {
    enter.addEventListener("click", () => {
      setBulkMode(true);
      updateList();
    });
    return;
  }
  const sel = getSelectedSet();
  const pinned = getPinnedIds();
  let allPinned = sel.size > 0;
  for (const id of sel) {
    if (!pinned.has(id)) { allPinned = false; break; }
  }
  document.getElementById("bulkPin")?.addEventListener("click", () => {
    if (sel.size === 0) return;
    sendBulkPinSessions(Array.from(sel), !allPinned);
  });
  document.getElementById("bulkExport")?.addEventListener("click", () => {
    if (sel.size === 0) return;
    sendBulkExportSessions(Array.from(sel));
  });
  document.getElementById("bulkDelete")?.addEventListener("click", () => {
    if (sel.size === 0) return;
    sendBulkDeleteSessions(Array.from(sel));
  });
  document.getElementById("bulkCancel")?.addEventListener("click", () => {
    setBulkMode(false);
    updateList();
  });
}

/**
 * Re-render the session list inside #sessionList. Groups items by
 * pinned status and date label. Wires click, context-menu, and resume
 * handlers on each item.
 */
export function updateList(): void {
  const container = document.getElementById("sessionList");
  if (!container) return;

  const filtered = getFiltered();
  const totalCount = filtered.length;
  const visibleCount = getVisibleCount();
  const visible = filtered.slice(0, visibleCount);
  const hasMore = totalCount > visibleCount;
  const pinnedIds = getPinnedIds();
  const selectedId = getSelectedId();
  const searchQuery = getSearchQuery();

  const groups = new Map<string, Session[]>();
  const pinned = visible.filter((s) => pinnedIds.has(s.id));
  const unpinned = visible.filter((s) => !pinnedIds.has(s.id));

  if (pinned.length > 0) groups.set("Pinned", pinned);
  for (const s of unpinned) {
    const l = dateLabel(s.endTime);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(s);
  }

  if (filtered.length === 0) {
    if (searchQuery) {
      container.innerHTML = renderEmptyState({
        iconSvg: icon("search-slash", 32),
        title: "No matching sessions",
        description: `Try a different keyword or clear the search to see all sessions.`,
        actionLabel: "Clear search",
        actionId: "emptyClearSearch",
      });
      container.querySelector<HTMLElement>("#emptyClearSearch")?.addEventListener("click", () => {
        const input = document.getElementById("search") as HTMLInputElement | null;
        if (input) {
          input.value = "";
          input.dispatchEvent(new Event("input"));
          input.focus();
        }
      });
    } else {
      container.innerHTML = renderEmptyState({
        iconSvg: icon("inbox", 32),
        title: "No sessions yet",
        description: "Start a new Claude Code session — your history will appear here.",
      });
    }
    return;
  }

  let h = renderCountRow(totalCount);
  for (const [label, sessions] of groups) {
    h += `<div class="group-label">${esc(label)}</div>`;
    for (const s of sessions) {
      h += renderSessionItem(s, s.id === selectedId, pinnedIds.has(s.id), isSelected(s.id));
    }
  }

  if (hasMore) {
    h += `<div class="show-more-row"><button class="show-more-btn" id="showMore">Show more (${totalCount - visibleCount} remaining)</button></div>`;
  }
  container.innerHTML = h;
  bindCountRow();
}

/**
 * Navigate back to the list view from the detail view.
 * Hides the detail panel, shows the list panel, and re-renders.
 */
export function showList(): void {
  setView("list");
  // Clear the persisted selection when returning to the list so no item
  // stays highlighted with the "active" background. The click on a list
  // item sets selectedId; there's no reason to carry that state back —
  // if the user re-opens the same detail, setSelectedId will refire.
  setSelectedId(null);
  // Reset any detail-view transcript-search filter so opening a
  // different session starts from the default paged view instead of
  // filtering by the previous query.
  setDetailSearchQuery("");
  // Drop the bulk selection on detail → list navigation. The user has
  // already left the multi-select context; preserving it would leave a
  // stale-looking toolbar on top of the freshly re-rendered list.
  clearSelection();
  document.getElementById("detailView")?.classList.add("hidden");
  document.getElementById("listView")?.classList.remove("hidden");
  updateList();
}
