/**
 * List view -- the main session list with search, filter, date chips,
 * quick actions bar, and footer. Uses extracted components for rendering.
 */

import { icon } from "../../../../webview/icons";
import { dateLabel, renderEmptyState } from "../../../../webview/utils";
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
import {
  bindSessionItems,
  createSessionItemNode,
  updateSessionItemNode,
} from "../components/sessionItem";
import { applyDiff } from "../components/listDiff";

const GROUP_KEY_PREFIX = "__group__:";
const SHOW_MORE_KEY = "__show-more__";

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
      <div id="listHeader" class="list-header" role="toolbar" aria-label="Session list header"></div>
      <div id="sessionList" class="list"></div>
    </div>
    <div class="panel hidden" id="detailView"></div>`;

  bindSearchBar(updateList);
  bindDropdown();
  bindBranchDropdown();
  bindDateChips(updateList);
  mountListHeader();

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

  // Event delegation on session list — bind once, survives child mutation
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
 * Build the header skeleton once. All buttons live in the DOM from
 * mount; `renderListHeader` flips classes / disabled / labels rather
 * than recreating nodes — so click handlers bound here survive every
 * subsequent state change (selection toggle, bulk enter/exit, etc.).
 */
export function mountListHeader(): void {
  const header = document.getElementById("listHeader");
  if (!header) return;

  const label = document.createElement("span");
  label.className = "list-header-label";
  label.id = "listHeaderLabel";

  const enterBtn = document.createElement("button");
  enterBtn.className = "list-count-toggle";
  enterBtn.id = "bulkEnter";
  enterBtn.title = "Enter bulk-select mode";
  enterBtn.innerHTML = `${icon("check", 12)} Select`;

  const pinBtn = document.createElement("button");
  pinBtn.className = "bulk-btn";
  pinBtn.id = "bulkPin";

  const exportBtn = document.createElement("button");
  exportBtn.className = "bulk-btn";
  exportBtn.id = "bulkExport";
  exportBtn.innerHTML = `${icon("download", 12)} Export`;

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "bulk-btn del";
  deleteBtn.id = "bulkDelete";
  deleteBtn.innerHTML = `${icon("trash-2", 12)} Delete`;

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "bulk-btn";
  cancelBtn.id = "bulkCancel";
  cancelBtn.title = "Exit bulk mode";
  cancelBtn.innerHTML = `${icon("x", 12)} Cancel`;

  header.replaceChildren(label, enterBtn, pinBtn, exportBtn, deleteBtn, cancelBtn);

  enterBtn.addEventListener("click", () => {
    setBulkMode(true);
    renderListHeader(getFiltered().length);
    updateList();
  });
  pinBtn.addEventListener("click", () => {
    const sel = getSelectedSet();
    if (sel.size === 0) return;
    const pinned = getPinnedIds();
    let allPinned = true;
    for (const id of sel) {
      if (!pinned.has(id)) { allPinned = false; break; }
    }
    sendBulkPinSessions(Array.from(sel), !allPinned);
  });
  exportBtn.addEventListener("click", () => {
    const sel = getSelectedSet();
    if (sel.size === 0) return;
    sendBulkExportSessions(Array.from(sel));
  });
  deleteBtn.addEventListener("click", () => {
    const sel = getSelectedSet();
    if (sel.size === 0) return;
    sendBulkDeleteSessions(Array.from(sel));
  });
  cancelBtn.addEventListener("click", () => {
    setBulkMode(false);
    renderListHeader(getFiltered().length);
    updateList();
  });
}

/**
 * Surgically update the header to reflect current state. Toggles the
 * bulk class, rewrites the label text, swaps the pin label/icon, and
 * sets the disabled attribute on bulk buttons. Buttons themselves are
 * never recreated — their listeners (bound in `mountListHeader`)
 * persist across every render.
 */
export function renderListHeader(totalCount: number): void {
  const header = document.getElementById("listHeader");
  if (!header) return;
  const label = header.querySelector<HTMLElement>("#listHeaderLabel");
  const enterBtn = header.querySelector<HTMLButtonElement>("#bulkEnter");
  const pinBtn = header.querySelector<HTMLButtonElement>("#bulkPin");
  const exportBtn = header.querySelector<HTMLButtonElement>("#bulkExport");
  const deleteBtn = header.querySelector<HTMLButtonElement>("#bulkDelete");
  const cancelBtn = header.querySelector<HTMLButtonElement>("#bulkCancel");
  if (!label || !enterBtn || !pinBtn || !exportBtn || !deleteBtn || !cancelBtn) return;

  if (!isBulkMode()) {
    header.classList.remove("list-header-bulk");
    const text = `${totalCount} session${totalCount !== 1 ? "s" : ""}`;
    if (label.textContent !== text) label.textContent = text;
    enterBtn.style.display = "";
    pinBtn.style.display = "none";
    exportBtn.style.display = "none";
    deleteBtn.style.display = "none";
    cancelBtn.style.display = "none";
    return;
  }

  const sel = getSelectedSet();
  const pinned = getPinnedIds();
  let allPinned = sel.size > 0;
  for (const id of sel) {
    if (!pinned.has(id)) { allPinned = false; break; }
  }
  const pinLabel = allPinned ? "Unpin" : "Pin";
  const pinIconName = allPinned ? "pin-off" : "pin";
  const count = sel.size;

  header.classList.add("list-header-bulk");
  const text = `${count} selected`;
  if (label.textContent !== text) label.textContent = text;
  enterBtn.style.display = "none";
  pinBtn.style.display = "";
  exportBtn.style.display = "";
  deleteBtn.style.display = "";
  cancelBtn.style.display = "";

  const pinHtml = `${icon(pinIconName, 12)} ${pinLabel}`;
  if (pinBtn.innerHTML !== pinHtml) pinBtn.innerHTML = pinHtml;
  pinBtn.disabled = count === 0;
  exportBtn.disabled = count === 0;
  deleteBtn.disabled = count === 0;
}

/**
 * Re-render the session list inside #sessionList. Groups items by
 * pinned status and date label. Reuses existing DOM nodes via keyed
 * reconciliation (`applyDiff`) so a search keystroke patches state on
 * surviving rows instead of tearing the list down.
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

  if (filtered.length === 0) {
    renderListHeader(0);
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

  const groups = new Map<string, Session[]>();
  const pinned = visible.filter((s) => pinnedIds.has(s.id));
  const unpinned = visible.filter((s) => !pinnedIds.has(s.id));

  if (pinned.length > 0) groups.set("Pinned", pinned);
  for (const s of unpinned) {
    const l = dateLabel(s.endTime);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(s);
  }

  // Build the desired key list and a parallel lookup so the updater
  // can resolve sessions / group labels back from a key without
  // re-walking the groups map.
  const desiredKeys: string[] = [];
  const groupLabelByKey = new Map<string, string>();
  const sessionByKey = new Map<string, Session>();
  for (const [label, sessions] of groups) {
    const groupKey = `${GROUP_KEY_PREFIX}${label}`;
    desiredKeys.push(groupKey);
    groupLabelByKey.set(groupKey, label);
    for (const s of sessions) {
      desiredKeys.push(s.id);
      sessionByKey.set(s.id, s);
    }
  }
  if (hasMore) desiredKeys.push(SHOW_MORE_KEY);

  applyDiff(
    container,
    desiredKeys,
    (key) => {
      if (key.startsWith(GROUP_KEY_PREFIX)) {
        const el = document.createElement("div");
        el.className = "group-label";
        return el;
      }
      if (key === SHOW_MORE_KEY) {
        const wrap = document.createElement("div");
        wrap.className = "show-more-row";
        const btn = document.createElement("button");
        btn.className = "show-more-btn";
        btn.id = "showMore";
        wrap.appendChild(btn);
        return wrap;
      }
      const session = sessionByKey.get(key);
      // Fallback never realistically hit — desiredKeys is built from
      // the same map — but keep the type tight without a non-null !.
      if (!session) return document.createElement("div");
      return createSessionItemNode(session);
    },
    (node, key) => {
      if (key.startsWith(GROUP_KEY_PREFIX)) {
        const label = groupLabelByKey.get(key) ?? "";
        if (node.textContent !== label) node.textContent = label;
        return;
      }
      if (key === SHOW_MORE_KEY) {
        const btn = node.querySelector<HTMLButtonElement>("#showMore");
        if (btn) {
          const text = `Show more (${totalCount - visibleCount} remaining)`;
          if (btn.textContent !== text) btn.textContent = text;
        }
        return;
      }
      const session = sessionByKey.get(key);
      if (!session) return;
      updateSessionItemNode(
        node,
        session,
        session.id === selectedId,
        pinnedIds.has(session.id),
        isSelected(session.id),
      );
    },
  );

  renderListHeader(totalCount);
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
