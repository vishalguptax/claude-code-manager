/**
 * Dropdown component -- renders the project filter dropdown and handles selection.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import {
  getAllSessions,
  getStats,
  getDeletedIds,
  getFilterProject,
  getCurrentProjectName,
  getProjects,
  setFilterProject,
  setFilterBranch,
  setVisibleCount,
} from "../state";

/**
 * Render the project filter dropdown shell (trigger + empty menu).
 *
 * Returns just the `.vs-select` block without an outer row wrapper so the
 * caller can compose this side-by-side with the branch dropdown inside a
 * shared `.filter-row`. The dropdown-item rows keep their own class
 * because their horizontal layout with count badges differs from the
 * generic `vs-select-option`.
 */
export function renderDropdown(): string {
  return `
    <div class="vs-select" id="dropdown">
      <button class="vs-select-trigger" id="dropdownBtn" type="button"
        aria-haspopup="listbox" aria-expanded="false">
        <span class="vs-select-value" id="dropdownLabel">All Projects</span>
        <span class="vs-select-arrow" aria-hidden="true">${icon("chevron-down", 14)}</span>
      </button>
      <div class="vs-select-menu hidden" id="dropdownMenu" role="listbox"></div>
    </div>`;
}

/**
 * Bind event listeners for the dropdown toggle and outside-click close.
 * Also flips aria-expanded on the trigger so screen readers track state.
 */
export function bindDropdown(): void {
  const btn = document.getElementById("dropdownBtn");
  const menu = document.getElementById("dropdownMenu");
  btn?.addEventListener("click", () => {
    const hidden = menu?.classList.toggle("hidden");
    btn.setAttribute("aria-expanded", hidden ? "false" : "true");
  });
  document.addEventListener("click", (e: MouseEvent) => {
    const dropdown = document.getElementById("dropdown");
    if (dropdown && !dropdown.contains(e.target as Node)) {
      menu?.classList.add("hidden");
      btn?.setAttribute("aria-expanded", "false");
    }
  });
}

/**
 * Rebuild the project dropdown menu to reflect current sessions and counts.
 * Updates the dropdown label and re-wires click handlers on each item.
 * @param onUpdate - Callback invoked after a filter selection changes
 */
export function updateDropdown(onUpdate: () => void): void {
  const menu = document.getElementById("dropdownMenu");
  const label = document.getElementById("dropdownLabel");
  if (!menu || !label) return;

  const projects = getProjects();
  const filterProject = getFilterProject();
  const currentProjectName = getCurrentProjectName();
  const allSessions = getAllSessions();
  const deletedIds = getDeletedIds();
  const stats = getStats();

  // Single O(N) pass: build a project -> count map AND tally the current
  // project at the same time. Replaces the previous O(P × N) pattern that
  // called allSessions.filter() once per project — which became visibly
  // janky on workspaces with many projects.
  const counts = new Map<string, number>();
  let currentCount = 0;
  for (const s of allSessions) {
    if (deletedIds.has(s.id)) continue;
    counts.set(s.project, (counts.get(s.project) ?? 0) + 1);
    if (currentProjectName && s.projectKey === currentProjectName) {
      currentCount++;
    }
  }

  if (filterProject === "current") {
    label.textContent = `This Project (${currentCount})`;
  } else if (filterProject === "all") {
    label.textContent = `All Projects (${stats.totalSessions})`;
  } else {
    label.textContent = `${filterProject} (${counts.get(filterProject) ?? 0})`;
  }

  let h = "";
  if (currentProjectName) {
    h += `<div class="dropdown-item ${filterProject === "current" ? "active" : ""}" data-value="current" title="${currentCount} session${currentCount === 1 ? "" : "s"} in this project"><span>This Project</span><span class="dropdown-count">${currentCount}</span></div>`;
  }
  h += `<div class="dropdown-item ${filterProject === "all" ? "active" : ""}" data-value="all" title="${stats.totalSessions} session${stats.totalSessions === 1 ? "" : "s"} across all projects"><span>All Projects</span><span class="dropdown-count">${stats.totalSessions}</span></div>`;
  if (projects.length > 0) h += `<div class="dropdown-sep"></div>`;
  for (const p of projects) {
    const count = counts.get(p) ?? 0;
    h += `<div class="dropdown-item ${filterProject === p ? "active" : ""}" data-value="${esc(p)}" title="${count} session${count === 1 ? "" : "s"} in ${esc(p)}"><span>${esc(p)}</span><span class="dropdown-count">${count}</span></div>`;
  }
  menu.innerHTML = h;

  menu.querySelectorAll(".dropdown-item").forEach((item) =>
    item.addEventListener("click", () => {
      const value = (item as HTMLElement).dataset.value;
      if (value) {
        setFilterProject(value);
        // Switching project makes the prior branch selection meaningless
        // — most branches don't exist across projects, so the filter
        // would either empty the list or hide unrelated sessions. Reset
        // to "all" so the user sees the new project's sessions, then
        // pick a branch from the refreshed branch dropdown if they want.
        setFilterBranch("all");
        setVisibleCount(30);
        menu.classList.add("hidden");
        updateDropdown(onUpdate);
        onUpdate();
      }
    })
  );
}
