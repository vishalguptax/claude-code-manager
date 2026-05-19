/**
 * Skills list view -- the main skill list with search, scope filter,
 * grouped by scope (Project / Global). Uses extracted components for rendering.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendGetSkills, sendGetSkillDetail } from "../api";
import { sendOpenUrl } from "../../../sessions/webview/api";
import { getMarketplaceSkillsUrl } from "../../../../webview/marketplace";
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
  const pluginCount = getSkillsByScope("plugin").length;

  let scopeFilterHtml = "";
  if (allSkills.length > 0) {
    // Plugin tab only renders when at least one plugin skill exists,
    // so users without plugins don't see an always-empty filter.
    const pluginBtn = pluginCount > 0
      ? `<button class="scope-btn ${scope === "plugin" ? "active" : ""}" data-scope="plugin">Plugin (${pluginCount})</button>`
      : "";
    scopeFilterHtml = `
      <div class="scope-filter" id="skillsScopeFilter">
        <button class="scope-btn ${scope === "all" ? "active" : ""}" data-scope="all">All (${allSkills.length})</button>
        <button class="scope-btn ${scope === "project" ? "active" : ""}" data-scope="project">Project (${projectCount})</button>
        <button class="scope-btn ${scope === "global" ? "active" : ""}" data-scope="global">Global (${globalCount})</button>
        ${pluginBtn}
      </div>`;
  }

  root.innerHTML = `
    <div class="panel" id="skillsListView">
      <div class="search-row">
        <div class="feature-search">
          <input id="skillsSearch" type="text" placeholder="Search skills..." value="${esc(searchQuery)}" />
          <button class="search-btn ${searchQuery ? "" : "is-hidden"}" id="skillsClear" title="Clear (Esc)">${icon("x", 14)}</button>
        </div>
        <button class="search-side-btn" id="skillsBrowse" title="Browse community skills (opens externally)">${icon("globe", 14)}</button>
        <button class="search-side-btn" id="skillsRefresh" title="Refresh skills list">${icon("refresh-cw", 14)}</button>
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
      const value = (btn as HTMLElement).dataset.scope as "all" | "project" | "global" | "plugin";
      if (value) {
        setFilterScope(value);
        // Update active state on buttons
        document.getElementById("skillsScopeFilter")?.querySelectorAll(".scope-btn").forEach((b) => {
          b.classList.toggle("active", (b as HTMLElement).dataset.scope === value);
        });
        updateSkillsList();
      }
    });
  });

  document.getElementById("skillsRefresh")?.addEventListener("click", () => sendGetSkills());
  document.getElementById("skillsBrowse")?.addEventListener("click", () =>
    sendOpenUrl(getMarketplaceSkillsUrl()),
  );

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
    if (searchQuery) {
      container.innerHTML = `<div class="empty">No matching skills</div>`;
    } else {
      // No skills, no query — show a discovery prompt with the
      // marketplace link inline so first-run users have somewhere to
      // go from the empty state.
      container.innerHTML = `
        <div class="empty">
          <div>No skills found</div>
          <button class="empty-link-btn" id="skillsBrowseEmpty">Browse community skills →</button>
        </div>`;
      container.querySelector("#skillsBrowseEmpty")?.addEventListener("click", () =>
        sendOpenUrl(getMarketplaceSkillsUrl()),
      );
    }
    return;
  }

  // Compound grouping: first by scope (Project / Global / per-plugin),
  // then by the folder `group` inside each scope. Top-level
  // (group === "") lives under the bare scope heading; nested skills
  // get an indented sub-heading showing the folder path.
  // Plugin-sourced skills get one group per plugin name (e.g.
  // "Plugin: caveman@caveman") so provenance is visible.
  type ScopeBucket = { top: Skill[]; nested: Map<string, Skill[]> };
  const groups = new Map<string, ScopeBucket>();
  for (const s of filtered) {
    const scopeLabel =
      s.scope === "project"
        ? "Project"
        : s.scope === "plugin"
          ? `Plugin: ${s.pluginName ?? "unknown"}`
          : "Global";
    let bucket = groups.get(scopeLabel);
    if (!bucket) {
      bucket = { top: [], nested: new Map() };
      groups.set(scopeLabel, bucket);
    }
    if (!s.group) {
      bucket.top.push(s);
    } else {
      const list = bucket.nested.get(s.group);
      if (list) list.push(s);
      else bucket.nested.set(s.group, [s]);
    }
  }

  let h = `<div class="list-count">${filtered.length} skill${filtered.length !== 1 ? "s" : ""}</div>`;
  for (const [label, bucket] of groups) {
    h += `<div class="group-label">${esc(label)}</div>`;
    for (const s of bucket.top) {
      h += renderSkillItem(s, selectedSkill?.id === s.id);
    }
    // Nested folders rendered alphabetically for stable ordering.
    const sortedNested = [...bucket.nested.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    for (const [folder, skills] of sortedNested) {
      h += `<div class="group-sublabel">${esc(folder)}</div>`;
      for (const s of skills) {
        h += renderSkillItem(s, selectedSkill?.id === s.id);
      }
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
