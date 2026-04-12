/**
 * List view -- the main session list with search, filter, date chips,
 * quick actions bar, and footer. Uses extracted components for rendering.
 */

import { icon } from "../../../../webview/icons";
import { esc, dateLabel, renderEmptyState } from "../../../../webview/utils";
import {
  sendNewSession,
  sendResumeSession,
  sendResumeMultiple,
  sendRefresh,
  sendGetSessionDetail,
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
  setLoading,
  setView,
  setShellMounted,
} from "../state";
import type { Session } from "../../types";
import { showDetail } from "./detailView";
import { showContextMenu } from "../components/contextMenu";
import { renderSearchBar, bindSearchBar } from "../components/searchBar";
import { renderDropdown, bindDropdown, updateDropdown } from "../components/dropdown";
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
        <button class="action-btn" id="actAll" title="Reopen all terminals from your last working session">${icon("split-square-horizontal")} Restore Workspace</button>
      </div>
      ${renderSearchBar()}
      ${renderDropdown()}
      ${renderDateChips()}
      <div id="sessionList" class="list"></div>
    </div>
    <div class="panel hidden" id="detailView"></div>`;

  bindSearchBar(updateList);
  bindDropdown();
  bindDateChips(updateList);

  document.getElementById("actNew")?.addEventListener("click", () => sendNewSession());
  document.getElementById("actAll")?.addEventListener("click", () => {
    const lastGroup = getLastSessionGroup();
    if (lastGroup.length) {
      sendResumeMultiple(lastGroup.map((s) => s.id), lastGroup.map((s) => s.projectPath));
    }
  });
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

  setShellMounted(true);
}

/**
 * Rebuild the project dropdown menu to reflect current sessions and counts.
 * Delegates to the dropdown component.
 */
export function updateFilter(): void {
  updateDropdown(updateList);
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

  let h = `<div class="list-count">${totalCount} session${totalCount !== 1 ? "s" : ""}</div>`;
  for (const [label, sessions] of groups) {
    h += `<div class="group-label">${esc(label)}</div>`;
    for (const s of sessions) {
      h += renderSessionItem(s, s.id === selectedId, pinnedIds.has(s.id));
    }
  }

  if (hasMore) {
    h += `<div class="show-more-row"><button class="show-more-btn" id="showMore">Show more (${totalCount - visibleCount} remaining)</button></div>`;
  }
  container.innerHTML = h;
}

/**
 * Navigate back to the list view from the detail view.
 * Hides the detail panel, shows the list panel, and re-renders.
 */
export function showList(): void {
  setView("list");
  document.getElementById("detailView")?.classList.add("hidden");
  document.getElementById("listView")?.classList.remove("hidden");
  updateList();
}
