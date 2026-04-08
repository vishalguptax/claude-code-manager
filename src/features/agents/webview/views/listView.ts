/**
 * Agents list view — renders the agent list with search and model filter,
 * with click-to-select navigation to the detail view.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendGetAgents } from "../api";
import {
  getAllAgents,
  getFilteredAgents,
  getAgentsByModel,
  getSearchQuery,
  getFilterModel,
  getSelectedAgent,
  setSelectedAgent,
  setSearchQuery,
  setFilterModel,
} from "../state";
import { renderAgentItem, bindAgentItems } from "../components/agentItem";
import { showAgentDetail } from "./detailView";
import type { Agent } from "../../types";

let _searchTimer: ReturnType<typeof setTimeout>;

/**
 * Render the agents list into the given container.
 * Includes a search bar, model filter buttons, refresh button, and agent items.
 * Shows an empty state when no agents are found.
 *
 * @param container - The DOM element to render into
 */
export function renderAgentsList(container: HTMLElement): void {
  const agents = getAllAgents();
  const searchQuery = getSearchQuery();
  const model = getFilterModel();

  const sonnetCount = getAgentsByModel("sonnet").length;
  const opusCount = getAgentsByModel("opus").length;
  const haikuCount = getAgentsByModel("haiku").length;

  let shell = `<div class="panel">
    <div class="feature-search">
      <input id="agentSearch" type="text" placeholder="Search agents..." value="${esc(searchQuery)}" />
      <div class="search-actions">
        <button class="search-btn ${searchQuery ? "" : "is-hidden"}" id="agentSearchClear" title="Clear (Esc)">${icon("x", 14)}</button>
        <button class="search-btn" id="agentRefresh" title="Refresh agents">${icon("refresh-cw", 14)}</button>
      </div>
    </div>`;

  if (agents.length > 0) {
    shell += `
    <div class="scope-filter" id="agentModelFilter">
      <button class="scope-btn ${model === "all" ? "active" : ""}" data-scope="all">All (${agents.length})</button>
      <button class="scope-btn ${model === "sonnet" ? "active" : ""}" data-scope="sonnet">Sonnet (${sonnetCount})</button>
      <button class="scope-btn ${model === "opus" ? "active" : ""}" data-scope="opus">Opus (${opusCount})</button>
      <button class="scope-btn ${model === "haiku" ? "active" : ""}" data-scope="haiku">Haiku (${haikuCount})</button>
    </div>`;
  }

  shell += `<div id="agentListInner" class="list"></div></div>`;
  container.innerHTML = shell;

  // Bind search
  const searchInput = container.querySelector("#agentSearch") as HTMLInputElement | null;
  const clearBtn = container.querySelector("#agentSearchClear");

  searchInput?.addEventListener("input", () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const q = searchInput.value.toLowerCase();
      setSearchQuery(q);
      clearBtn?.classList.toggle("is-hidden", !q);
      updateAgentsListInner(container);
    }, 150);
  });

  searchInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      setSearchQuery("");
      clearBtn?.classList.add("is-hidden");
      updateAgentsListInner(container);
      searchInput.focus();
    }
  });

  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    setSearchQuery("");
    clearBtn?.classList.add("is-hidden");
    updateAgentsListInner(container);
    searchInput?.focus();
  });

  // Bind model filter
  container.querySelector("#agentModelFilter")?.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = (btn as HTMLElement).dataset.scope as "all" | "sonnet" | "opus" | "haiku";
      if (value) {
        setFilterModel(value);
        renderAgentsList(container);
      }
    });
  });

  // Bind refresh
  container.querySelector("#agentRefresh")?.addEventListener("click", () => sendGetAgents());

  // Render inner list
  updateAgentsListInner(container);
}

/**
 * Update just the inner agent list items without rebuilding the full shell.
 * @param container - The parent DOM element containing #agentListInner
 */
function updateAgentsListInner(container: HTMLElement): void {
  const inner = container.querySelector("#agentListInner");
  if (!inner) return;

  const allAgents = getAllAgents();
  const filtered = getFilteredAgents();
  const selected = getSelectedAgent();
  const searchQuery = getSearchQuery();

  if (allAgents.length === 0) {
    inner.innerHTML = `
      <div class="agent-empty">
        <div class="agent-empty-title">No agents found</div>
        <div class="agent-empty-desc">
          Agents are <code>.md</code> files in your project's <code>.claude/agents/</code> directory.<br><br>
          Each file uses YAML frontmatter with <code>name</code>, <code>description</code>,
          and <code>model</code> fields, followed by the agent's system prompt.
        </div>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    inner.innerHTML = `<div class="empty">${searchQuery ? "No matching agents" : "No agents found"}</div>`;
    return;
  }

  let h = `<div class="agent-list-count">${filtered.length} agent${filtered.length !== 1 ? "s" : ""}</div>`;

  for (const agent of filtered) {
    h += renderAgentItem(agent, selected?.path === agent.path);
  }

  inner.innerHTML = h;

  bindAgentItems(inner as HTMLElement, filtered, (agent: Agent) => {
    setSelectedAgent(agent);
    showAgentDetail(container);
  });
}

/**
 * Navigate back to the agent list from the detail view.
 *
 * @param container - The DOM element to render the list into
 */
export function showAgentList(container: HTMLElement): void {
  setSelectedAgent(null);
  renderAgentsList(container);
}
