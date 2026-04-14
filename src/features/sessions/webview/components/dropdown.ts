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
  setVisibleCount,
} from "../state";

/**
 * Render the dropdown HTML string.
 * @returns HTML for the project filter dropdown
 */
export function renderDropdown(): string {
  return `
    <div class="filter-row">
      <div class="dropdown" id="dropdown">
        <button class="dropdown-btn" id="dropdownBtn"><span id="dropdownLabel">All Projects</span>${icon("chevron-down")}</button>
        <div class="dropdown-menu hidden" id="dropdownMenu"></div>
      </div>
    </div>`;
}

/**
 * Bind event listeners for the dropdown toggle and outside-click close.
 */
export function bindDropdown(): void {
  document.getElementById("dropdownBtn")?.addEventListener("click", () => {
    document.getElementById("dropdownMenu")?.classList.toggle("hidden");
  });
  document.addEventListener("click", (e: MouseEvent) => {
    const dropdown = document.getElementById("dropdown");
    if (dropdown && !dropdown.contains(e.target as Node)) {
      document.getElementById("dropdownMenu")?.classList.add("hidden");
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
    h += `<div class="dropdown-item ${filterProject === "current" ? "active" : ""}" data-value="current"><span>This Project</span><span class="dropdown-count">${currentCount}</span></div>`;
  }
  h += `<div class="dropdown-item ${filterProject === "all" ? "active" : ""}" data-value="all"><span>All Projects</span><span class="dropdown-count">${stats.totalSessions}</span></div>`;
  if (projects.length > 0) h += `<div class="dropdown-sep"></div>`;
  for (const p of projects) {
    const count = counts.get(p) ?? 0;
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
        updateDropdown(onUpdate);
        onUpdate();
      }
    })
  );
}
