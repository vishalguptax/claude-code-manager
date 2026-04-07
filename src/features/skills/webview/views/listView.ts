/**
 * Skills list view -- the main skill list with search, grouped by scope
 * (Project / Global). Uses extracted components for rendering.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendGetSkills, sendGetSkillDetail } from "../api";
import {
  getAllSkills,
  getFilteredSkills,
  getSkillsSearchQuery,
  getSelectedSkill,
  setSelectedSkill,
  setSkillsSearchQuery,
  setSkillsShellMounted,
} from "../state";
import type { Skill } from "../../types";
import { showSkillDetail } from "./detailView";
import { renderSkillItem, bindSkillItems } from "../components/skillItem";

/**
 * Build the initial shell HTML for the skills list view and wire up
 * static event listeners. Called once when the first batch of skills arrives.
 */
export function mountSkillsShell(): void {
  const root = document.getElementById("skillsRoot");
  if (!root) return;

  root.innerHTML = `
    <div class="panel" id="skillsListView">
      <div class="actions-bar">
        <button class="action-btn icon-only" id="skillsRefresh" title="Refresh skills list">${icon("refresh-cw")}</button>
      </div>
      <div class="search-row" style="margin:8px 12px 0;">
        <input id="skillsSearch" type="search" placeholder="Search skills..." />
        <div class="search-actions">
          <button class="search-btn is-hidden" id="skillsClear" title="Clear search">${icon("x", 14)}</button>
        </div>
      </div>
      <div id="skillsList" class="list"></div>
    </div>
    <div class="panel hidden" id="skillsDetailView"></div>`;

  // Search binding
  const searchInput = document.getElementById("skillsSearch") as HTMLInputElement | null;
  const clearBtn = document.getElementById("skillsClear");

  searchInput?.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    setSkillsSearchQuery(q);
    clearBtn?.classList.toggle("is-hidden", !q);
    updateSkillsList();
  });

  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    setSkillsSearchQuery("");
    clearBtn.classList.add("is-hidden");
    updateSkillsList();
  });

  document.getElementById("skillsRefresh")?.addEventListener("click", () => sendGetSkills());

  setSkillsShellMounted(true);
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
