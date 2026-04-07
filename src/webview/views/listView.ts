/**
 * List view — the main session list, search bar, filter dropdown, date chips,
 * quick actions bar, and footer. Handles all DOM rendering and event wiring
 * for the list screen.
 */

import { icon } from "../icons";
import { esc, fmtTime, dateLabel } from "../utils";
import {
  sendNewSession,
  sendResumeSession,
  sendResumeMultiple,
  sendRefresh,
  sendGetSessionDetail,
  sendOpenUrl,
} from "../api";
import {
  getAllSessions,
  getStats,
  getPinnedIds,
  getDeletedIds,
  getFiltered,
  getProjects,
  getFilterDate,
  getFilterProject,
  getSearchQuery,
  getSelectedId,
  getVisibleCount,
  getCurrentProjectName,
  setFilterDate,
  setFilterProject,
  setSearchQuery,
  setVisibleCount,
  incrementVisibleCount,
  setSelectedId,
  setLoading,
  setView,
  setShellMounted,
} from "../state";
import type { DateFilter, Session } from "../types";
import { showDetail } from "./detailView";
import { showContextMenu } from "../components/contextMenu";

let searchTimer: ReturnType<typeof setTimeout>;

/**
 * Build the initial shell HTML for the list view and wire up all
 * static event listeners (search, actions bar, date chips, footer links).
 * Called once when the first batch of sessions arrives.
 */
export function mountShell(): void {
  const root = document.getElementById("root");
  if (!root) return;

  const filterDate = getFilterDate();

  root.innerHTML = `
    <div class="panel" id="listView">
      <div class="actions-bar">
        <button class="action-btn" id="actNew" title="Start a new Claude session">${icon("plus")} New Session</button>
        <button class="action-btn" id="actLast" title="Resume the most recent session">${icon("play")} Resume Last</button>
        <button class="action-btn" id="actAll" title="Open recent sessions in separate terminals">${icon("split-square-horizontal")} Resume All</button>
        <button class="action-btn icon-only" id="actRefresh" title="Refresh session list">${icon("refresh-cw")}</button>
      </div>
      <div class="search-row">
        <input id="search" type="text" placeholder="Search sessions..." />
        <div class="search-actions">
          <button class="search-btn is-hidden" id="searchClear" title="Clear (Esc)">${icon("x")}</button>
        </div>
      </div>
      <div class="filter-row">
        <div class="dropdown" id="dropdown">
          <button class="dropdown-btn" id="dropdownBtn"><span id="dropdownLabel">All Projects</span>${icon("chevron-down")}</button>
          <div class="dropdown-menu hidden" id="dropdownMenu"></div>
        </div>
      </div>
      <div class="date-chips">
        <button class="chip ${filterDate === "today" ? "active" : ""}" data-date="today">Today</button>
        <button class="chip ${filterDate === "week" ? "active" : ""}" data-date="week">Week</button>
        <button class="chip ${filterDate === "month" ? "active" : ""}" data-date="month">Month</button>
        <button class="chip ${filterDate === "all" ? "active" : ""}" data-date="all">All</button>
      </div>
      <div id="sessionList" class="list"></div>
      <div class="app-footer">
        <span class="footer-name">Claude Code Manager</span>
        <span class="footer-credit">Made by <strong>Vishal</strong></span>
        <span class="footer-links">
          <button class="footer-link" data-url="https://github.com/vishalguptax/claude-code-manager" title="GitHub">${icon("github")}</button>
          <button class="footer-link" data-url="https://www.linkedin.com/in/vishalgupta26/" title="LinkedIn">${icon("linkedin")}</button>
        </span>
      </div>
    </div>
    <div class="panel hidden" id="detailView"></div>`;

  document.getElementById("search")?.addEventListener("input", onSearch);
  document.getElementById("searchClear")?.addEventListener("click", clearSearch);
  document.getElementById("search")?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") clearSearch();
  });
  document.getElementById("dropdownBtn")?.addEventListener("click", () => {
    document.getElementById("dropdownMenu")?.classList.toggle("hidden");
  });
  document.addEventListener("click", (e: MouseEvent) => {
    const dropdown = document.getElementById("dropdown");
    if (dropdown && !dropdown.contains(e.target as Node)) {
      document.getElementById("dropdownMenu")?.classList.add("hidden");
    }
  });
  document.getElementById("actNew")?.addEventListener("click", () => sendNewSession());
  document.getElementById("actLast")?.addEventListener("click", () => {
    const first = getFiltered()[0];
    if (first) sendResumeSession(first.id, first.entrypoint, first.projectPath);
  });
  document.getElementById("actAll")?.addEventListener("click", () => {
    const recent = getFiltered().slice(0, 3);
    if (recent.length) sendResumeMultiple(recent.map((s) => s.id), recent.map((s) => s.projectPath));
  });
  document.getElementById("actRefresh")?.addEventListener("click", () => sendRefresh());

  document.querySelectorAll(".chip[data-date]").forEach((c) =>
    c.addEventListener("click", () => {
      const value = (c as HTMLElement).dataset.date as DateFilter;
      setFilterDate(value);
      setVisibleCount(30);
      document.querySelectorAll(".chip[data-date]").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      updateList();
    })
  );

  document.querySelectorAll(".footer-link[data-url]").forEach((el) => {
    el.addEventListener("click", () => {
      const url = (el as HTMLElement).dataset.url;
      if (url) sendOpenUrl(url);
    });
  });

  setShellMounted(true);
}

/**
 * Handle search input with a 150ms debounce.
 */
export function onSearch(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const input = document.getElementById("search") as HTMLInputElement | null;
    if (!input) return;
    setSearchQuery(input.value.toLowerCase());
    setVisibleCount(30);
    document.getElementById("searchClear")?.classList.toggle("is-hidden", !input.value);
    updateList();
  }, 150);
}

/**
 * Clear the search input and reset the query filter.
 */
export function clearSearch(): void {
  const input = document.getElementById("search") as HTMLInputElement | null;
  if (!input) return;
  input.value = "";
  setSearchQuery("");
  document.getElementById("searchClear")?.classList.add("is-hidden");
  updateList();
  input.focus();
}

/**
 * Rebuild the project dropdown menu to reflect current sessions and counts.
 * Updates the dropdown label and re-wires click handlers on each item.
 */
export function updateFilter(): void {
  const menu = document.getElementById("dropdownMenu");
  const label = document.getElementById("dropdownLabel");
  if (!menu || !label) return;

  const projects = getProjects();
  const filterProject = getFilterProject();
  const currentProjectName = getCurrentProjectName();
  const allSessions = getAllSessions();
  const deletedIds = getDeletedIds();
  const stats = getStats();
  const currentCount = currentProjectName
    ? allSessions.filter((s) => s.project === currentProjectName && !deletedIds.has(s.id)).length
    : 0;

  if (filterProject === "current") {
    label.textContent = `This Project (${currentCount})`;
  } else if (filterProject === "all") {
    label.textContent = `All Projects (${stats.totalSessions})`;
  } else {
    label.textContent = `${filterProject} (${allSessions.filter((s) => s.project === filterProject && !deletedIds.has(s.id)).length})`;
  }

  let h = "";
  if (currentProjectName) {
    h += `<div class="dropdown-item ${filterProject === "current" ? "active" : ""}" data-value="current"><span>This Project</span><span class="dropdown-count">${currentCount}</span></div>`;
  }
  h += `<div class="dropdown-item ${filterProject === "all" ? "active" : ""}" data-value="all"><span>All Projects</span><span class="dropdown-count">${stats.totalSessions}</span></div>`;
  if (projects.length > 0) h += `<div class="dropdown-sep"></div>`;
  for (const p of projects) {
    const count = allSessions.filter((s) => s.project === p && !deletedIds.has(s.id)).length;
    h += `<div class="dropdown-item ${filterProject === p ? "active" : ""}" data-value="${esc(p)}"><span>${esc(p)}</span><span class="dropdown-count">${count}</span></div>`;
  }
  menu.innerHTML = h;

  menu.querySelectorAll(".dropdown-item").forEach((item) =>
    item.addEventListener("click", () => {
      const value = (item as HTMLElement).dataset.value;
      if (value) {
        setFilterProject(value);
        setVisibleCount(30);
        menu.classList.add("hidden");
        updateFilter();
        updateList();
      }
    })
  );
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
    container.innerHTML = `<div class="empty">${searchQuery ? "No results" : "No sessions"}</div>`;
    return;
  }

  let h = `<div class="list-count">${totalCount} session${totalCount !== 1 ? "s" : ""}</div>`;
  for (const [label, sessions] of groups) {
    h += `<div class="group-label">${esc(label)}</div>`;
    for (const s of sessions) {
      const active = s.id === selectedId;
      const isPinned = pinnedIds.has(s.id);
      const name = s.name || (s.prompts[0] ? (s.prompts[0].length > 50 ? s.prompts[0].slice(0, 50) + "..." : s.prompts[0]) : "Untitled session");
      const branch = s.branch && s.branch !== "HEAD" ? s.branch : "";
      const time = fmtTime(s.endTime);
      const fullName = s.name || s.prompts[0] || "Untitled session";
      const firstPrompt = s.prompts[0] ? (s.prompts[0].length > 40 ? s.prompts[0].slice(0, 40) + "..." : s.prompts[0]) : "";
      const showSubPrompt = s.name && firstPrompt;

      h += `
        <div class="item ${active ? "active" : ""}" data-id="${s.id}">
          <div class="item-row1">
            <span class="item-name" title="${esc(fullName)}">${esc(name)}</span>
            <span class="item-time">${time}</span>
          </div>
          <button class="item-resume" data-resume="${s.id}" title="Resume session">${icon("play")}</button>
          ${showSubPrompt ? `<div class="item-prompt">${esc(firstPrompt)}</div>` : ""}
          <div class="item-row2">
            ${isPinned ? `<span class="pin-icon">${icon("pin")}</span>` : ""}
            ${s.entrypoint === "vscode" ? `<span class="item-ep">ext</span>` : ""}
            ${branch ? `<span class="tag">${esc(branch)}</span>` : ""}
            <span class="item-proj">${esc(s.project)}</span>
          </div>
        </div>`;
    }
  }

  if (hasMore) {
    h += `<div class="show-more-row"><button class="show-more-btn" id="showMore">Show more (${totalCount - visibleCount} remaining)</button></div>`;
  }
  container.innerHTML = h;

  document.getElementById("showMore")?.addEventListener("click", () => {
    incrementVisibleCount(30);
    updateList();
  });

  // List item click -> detail
  container.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", (e: Event) => {
      if ((e.target as HTMLElement).closest(".item-resume")) return;
      const id = (el as HTMLElement).dataset.id;
      if (!id) return;
      setSelectedId(id);
      setLoading(true);
      showDetail();
      sendGetSessionDetail(id);
    });

    // Right-click context menu
    el.addEventListener("contextmenu", (e: Event) => {
      e.preventDefault();
      const id = (el as HTMLElement).dataset.id;
      if (!id) return;
      const isPinned = pinnedIds.has(id);
      showContextMenu(e as MouseEvent, id, isPinned);
    });
  });

  // Resume button
  container.querySelectorAll("[data-resume]").forEach((btn) =>
    btn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.resume;
      if (!id) return;
      const s = getAllSessions().find((x) => x.id === id);
      if (s) sendResumeSession(id, s.entrypoint, s.projectPath);
    })
  );
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
