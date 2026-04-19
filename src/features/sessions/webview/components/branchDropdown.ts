/**
 * Branch filter dropdown — mirrors the project dropdown pattern but
 * keyed on `Session.branch`. Lists every branch that has at least one
 * session, sorted with the workspace's current git branch first, then
 * by most-recent activity. Paired with the project dropdown in the
 * same filter row.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import {
  getAllSessions,
  getDeletedIds,
  getFilterBranch,
  getFilterProject,
  getCurrentBranch,
  getCurrentProjectName,
  setFilterBranch,
  setVisibleCount,
} from "../state";

/** Render the dropdown shell — trigger + empty menu. */
export function renderBranchDropdown(): string {
  return `
    <div class="vs-select" id="branchDropdown">
      <button class="vs-select-trigger" id="branchDropdownBtn" type="button"
        aria-haspopup="listbox" aria-expanded="false"
        title="Filter sessions by git branch">
        <span class="vs-select-leading" aria-hidden="true">${icon("git-branch", 13)}</span>
        <span class="vs-select-value" id="branchDropdownLabel">All Branches</span>
        <span class="vs-select-arrow" aria-hidden="true">${icon("chevron-down", 14)}</span>
      </button>
      <div class="vs-select-menu hidden" id="branchDropdownMenu" role="listbox"></div>
    </div>`;
}

/** Wire the toggle click + outside-click-to-close handlers (once). */
export function bindBranchDropdown(): void {
  const btn = document.getElementById("branchDropdownBtn");
  const menu = document.getElementById("branchDropdownMenu");
  btn?.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    const hidden = menu?.classList.toggle("hidden");
    btn.setAttribute("aria-expanded", hidden ? "false" : "true");
  });
  document.addEventListener("click", (e: MouseEvent) => {
    const container = document.getElementById("branchDropdown");
    if (container && !container.contains(e.target as Node)) {
      menu?.classList.add("hidden");
      btn?.setAttribute("aria-expanded", "false");
    }
  });
}

/**
 * Rebuild the branch menu and refresh the trigger label. Called after
 * each session update (new branches can appear) and after each workspace
 * branch change (so the current-branch marker tracks checkouts).
 */
export function updateBranchDropdown(onUpdate: () => void): void {
  const menu = document.getElementById("branchDropdownMenu");
  const label = document.getElementById("branchDropdownLabel");
  if (!menu || !label) return;

  const sessions = getAllSessions();
  const deleted = getDeletedIds();
  const filterBranch = getFilterBranch();
  const currentBranch = getCurrentBranch();
  const filterProject = getFilterProject();
  const currentProjectName = getCurrentProjectName();

  // Scope to the active project filter so the branch list reflects what
  // the user is actually browsing. Without this, switching to "This
  // Project" would still show branches from every other project and
  // counts would be misleading.
  const inProjectScope = (s: { project: string; projectKey: string }): boolean => {
    if (filterProject === "all") return true;
    if (filterProject === "current") {
      // Cold-start race: workspace name not resolved yet — fall through
      // so the dropdown is at least populated instead of empty.
      return !currentProjectName || s.projectKey === currentProjectName;
    }
    return s.project === filterProject;
  };

  // Single O(N) pass: count sessions per branch, track latest activity
  // per branch for the sort. Sessions with an empty branch (non-repo
  // projects) are collapsed into an "(no branch)" bucket so the filter
  // stays exhaustive.
  const counts = new Map<string, number>();
  const latest = new Map<string, number>();
  let totalNonDeleted = 0;
  for (const s of sessions) {
    if (deleted.has(s.id)) continue;
    if (!inProjectScope(s)) continue;
    totalNonDeleted++;
    const key = s.branch || "(no branch)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const prev = latest.get(key) ?? 0;
    if (s.endTime > prev) latest.set(key, s.endTime);
  }

  // Sort: current branch first, then by most-recent activity.
  const branches = [...counts.keys()].sort((a, b) => {
    if (a === currentBranch && b !== currentBranch) return -1;
    if (b === currentBranch && a !== currentBranch) return 1;
    return (latest.get(b) ?? 0) - (latest.get(a) ?? 0);
  });

  // Trigger label mirrors what the user picked. "all" is default; a
  // specific branch echoes the name + its count.
  if (filterBranch === "all") {
    label.textContent = `All Branches (${totalNonDeleted})`;
  } else {
    label.textContent = `${filterBranch} (${counts.get(filterBranch) ?? 0})`;
  }

  let h = `<div class="dropdown-item ${filterBranch === "all" ? "active" : ""}" data-value="all"><span>All Branches</span><span class="dropdown-count" title="${totalNonDeleted} session${totalNonDeleted === 1 ? "" : "s"}">${totalNonDeleted}</span></div>`;
  if (branches.length > 0) h += `<div class="dropdown-sep"></div>`;
  for (const b of branches) {
    const count = counts.get(b) ?? 0;
    const isCurrent = b === currentBranch;
    // Escaping branch names matters — they can legally contain slashes,
    // but also special chars if a user names a branch oddly. The esc
    // on data-value guards the attribute context and on the label
    // text-content guards the DOM.
    h += `<div class="dropdown-item ${filterBranch === b ? "active" : ""}" data-value="${esc(b)}" title="${count} session${count === 1 ? "" : "s"} on ${esc(b)}"><span>${esc(b)}${isCurrent ? ' <span class="dropdown-tag">current</span>' : ""}</span><span class="dropdown-count">${count}</span></div>`;
  }
  menu.innerHTML = h;

  menu.querySelectorAll(".dropdown-item").forEach((item) =>
    item.addEventListener("click", () => {
      const value = (item as HTMLElement).dataset.value;
      if (value) {
        setFilterBranch(value);
        setVisibleCount(30);
        menu.classList.add("hidden");
        document
          .getElementById("branchDropdownBtn")
          ?.setAttribute("aria-expanded", "false");
        updateBranchDropdown(onUpdate);
        onUpdate();
      }
    }),
  );
}
