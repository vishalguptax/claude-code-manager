/**
 * Skills list view -- the main skill list with search, scope filter,
 * grouped by scope (Project / Global). Uses extracted components for rendering.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendGetSkills, sendGetSkillDetail } from "../api";
import {
  getAllSkills,
  getFilteredSkills,
  getSkillsSearchQuery,
  getFilterScope,
  getSkillsByScope,
  getSelectedSkill,
  setSelectedSkill,
  setSkillsSearchQuery,
  setFilterScope,
  setSkillsShellMounted,
} from "../state";
import type { Skill } from "../../types";
import { showSkillDetail } from "./detailView";
import { renderSkillItem, bindSkillItems } from "../components/skillItem";

let _searchTimer: ReturnType<typeof setTimeout>;

/**
 * Build the initial shell HTML for the skills list view and wire up
 * static event listeners. Called once when the first batch of skills arrives.
 */
export function mountSkillsShell(): void {
  const root = document.getElementById("skillsRoot");
  if (!root) return;

  const allSkills = getAllSkills();
  const searchQuery = getSkillsSearchQuery();
  const scope = getFilterScope();
  const projectCount = getSkillsByScope("project").length;
  const globalCount = getSkillsByScope("global").length;

  let scopeFilterHtml = "";
  if (allSkills.length > 0) {
    scopeFilterHtml = `
      <div class="scope-filter" id="skillsScopeFilter">
        <button class="scope-btn ${scope === "all" ? "active" : ""}" data-scope="all">All (${allSkills.length})</button>
        <button class="scope-btn ${scope === "project" ? "active" : ""}" data-scope="project">Project (${projectCount})</button>
        <button class="scope-btn ${scope === "global" ? "active" : ""}" data-scope="global">Global (${globalCount})</button>
      </div>`;
  }

  root.innerHTML = `
    <div class="panel" id="skillsListView">
      <div class="actions-bar">
        <button class="action-btn icon-only" id="skillsRefresh" title="Refresh skills list">${icon("refresh-cw")}</button>
      </div>
      <div class="feature-search">
        <input id="skillsSearch" type="text" placeholder="Search skills..." value="${esc(searchQuery)}" />
        <div class="search-actions">
          <button class="search-btn ${searchQuery ? "" : "is-hidden"}" id="skillsClear" title="Clear (Esc)">${icon("x", 14)}</button>
        </div>
      </div>
      ${scopeFilterHtml}
      <div id="skillsList" class="list"></div>
    </div>
    <div class="panel hidden" id="skillsDetailView"></div>`;

  // Search binding with 150ms debounce
  const searchInput = document.getElementById("skillsSearch") as HTMLInputElement | null;
  const clearBtn = document.getElementById("skillsClear");

  searchInput?.addEventListener("input", () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const q = searchInput.value.toLowerCase();
      setSkillsSearchQuery(q);
      clearBtn?.classList.toggle("is-hidden", !q);
      updateSkillsList();
    }, 150);
  });

  searchInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      setSkillsSearchQuery("");
      clearBtn?.classList.add("is-hidden");
      updateSkillsList();
      searchInput.focus();
    }
  });

  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    setSkillsSearchQuery("");
    clearBtn.classList.add("is-hidden");
    updateSkillsList();
    searchInput?.focus();
  });

  // Scope filter binding
  document.getElementById("skillsScopeFilter")?.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = (btn as HTMLElement).dataset.scope as "all" | "project" | "global";
      if (value) {
        setFilterScope(value);
        // Re-mount to update scope button counts and active state
        mountSkillsShell();
      }
    });
  });

  document.getElementById("skillsRefresh")?.addEventListener("click", () => sendGetSkills());

  setSkillsShellMounted(true);
  updateSkillsList();
}

/**
 * Re-render the skills list inside #skillsList. Groups items by scope
 * (Project / Global). Wires click handlers on each item.
 */
export function updateSkillsList(): void {
  const container = document.getElementById("skillsList");
  if (!container) return;

  const filtered = getFilteredSkills();
  const selectedSkill = getSelectedSkill();
  const searchQuery = getSkillsSearchQuery();

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty">${searchQuery ? "No matching skills" : "No skills found"}</div>`;
    return;
  }

  const groups = new Map<string, Skill[]>();
  for (const s of filtered) {
    const label = s.scope === "project" ? "Project" : "Global";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(s);
  }

  let h = `<div class="list-count">${filtered.length} skill${filtered.length !== 1 ? "s" : ""}</div>`;
  for (const [label, skills] of groups) {
    h += `<div class="group-label">${esc(label)}</div>`;
    for (const s of skills) {
      h += renderSkillItem(s, selectedSkill?.id === s.id);
    }
  }

  container.innerHTML = h;

  bindSkillItems(container, {
    onSelect: (id: string) => {
      const skill = getAllSkills().find((s) => s.id === id);
      if (skill) {
        setSelectedSkill(skill);
        sendGetSkillDetail(id);
        showSkillDetail();
      }
    },
  });
}

/**
 * Navigate back to the skills list view from the detail view.
 * Hides the detail panel, shows the list panel, and re-renders.
 */
export function showSkillsList(): void {
  document.getElementById("skillsDetailView")?.classList.add("hidden");
  document.getElementById("skillsListView")?.classList.remove("hidden");
  updateSkillsList();
}
