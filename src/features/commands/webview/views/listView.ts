/**
 * Commands list view — renders the command list with search and scope filter,
 * grouped by scope, with click-to-select navigation to the detail view.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendGetCommands } from "../api";
import {
  getAllCommands,
  getFilteredCommands,
  getCommandsByScope,
  getSearchQuery,
  getFilterScope,
  getSelectedCommand,
  setSelectedCommand,
  setSearchQuery,
  setFilterScope,
} from "../state";
import { renderCommandItem, bindCommandItems } from "../components/commandItem";
import { showCommandDetail } from "./detailView";
import type { Command } from "../../types";

let _searchTimer: ReturnType<typeof setTimeout>;

/**
 * Render the commands list into the given container.
 * Includes a search bar, scope filter buttons, and command items
 * grouped by scope (project first, then global).
 * Shows an empty state when no commands are found.
 *
 * @param container - The DOM element to render into
 */
export function renderCommandsList(container: HTMLElement): void {
  const allCommands = getAllCommands();
  const selected = getSelectedCommand();
  const searchQuery = getSearchQuery();
  const scope = getFilterScope();

  // Build shell with search, scope filter, refresh, and list container
  const projectCount = getCommandsByScope("project").length;
  const globalCount = getCommandsByScope("global").length;

  let shell = `
    <div class="actions-bar">
      <button class="action-btn icon-only" id="cmdRefresh" title="Refresh commands">${icon("refresh-cw")}</button>
    </div>
    <div class="feature-search">
      <input id="cmdSearch" type="text" placeholder="Search commands..." value="${esc(searchQuery)}" />
      <div class="search-actions">
        <button class="search-btn ${searchQuery ? "" : "is-hidden"}" id="cmdSearchClear" title="Clear (Esc)">${icon("x", 14)}</button>
      </div>
    </div>`;

  if (allCommands.length > 0) {
    shell += `
    <div class="scope-filter" id="cmdScopeFilter">
      <button class="scope-btn ${scope === "all" ? "active" : ""}" data-scope="all">All (${allCommands.length})</button>
      <button class="scope-btn ${scope === "project" ? "active" : ""}" data-scope="project">Project (${projectCount})</button>
      <button class="scope-btn ${scope === "global" ? "active" : ""}" data-scope="global">Global (${globalCount})</button>
    </div>`;
  }

  shell += `<div id="cmdListInner"></div>`;
  container.innerHTML = shell;

  // Bind search
  const searchInput = container.querySelector("#cmdSearch") as HTMLInputElement | null;
  const clearBtn = container.querySelector("#cmdSearchClear");

  searchInput?.addEventListener("input", () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const q = searchInput.value.toLowerCase();
      setSearchQuery(q);
      clearBtn?.classList.toggle("is-hidden", !q);
      updateCommandsListInner(container);
    }, 150);
  });

  searchInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      setSearchQuery("");
      clearBtn?.classList.add("is-hidden");
      updateCommandsListInner(container);
      searchInput.focus();
    }
  });

  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    setSearchQuery("");
    clearBtn?.classList.add("is-hidden");
    updateCommandsListInner(container);
    searchInput?.focus();
  });

  // Bind scope filter
  container.querySelector("#cmdScopeFilter")?.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = (btn as HTMLElement).dataset.scope as "all" | "project" | "global";
      if (value) {
        setFilterScope(value);
        renderCommandsList(container);
      }
    });
  });

  // Bind refresh
  container.querySelector("#cmdRefresh")?.addEventListener("click", () => sendGetCommands());

  // Render inner list
  updateCommandsListInner(container);
}

/**
 * Update just the inner command list items without rebuilding the full shell.
 * @param container - The parent DOM element containing #cmdListInner
 */
function updateCommandsListInner(container: HTMLElement): void {
  const inner = container.querySelector("#cmdListInner");
  if (!inner) return;

  const filtered = getFilteredCommands();
  const selected = getSelectedCommand();
  const searchQuery = getSearchQuery();

  if (getAllCommands().length === 0) {
    inner.innerHTML = `
      <div class="cmd-empty">
        <div class="cmd-empty-title">No commands yet</div>
        <div class="cmd-empty-desc">
          Custom slash commands are markdown files stored in:<br>
          <code>~/.claude/commands/</code> (global)<br>
          <code>.claude/commands/</code> (project-level)<br><br>
          Each <code>.md</code> file becomes a <code>/command</code>. The filename is the command name.
        </div>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    inner.innerHTML = `<div class="empty">${searchQuery ? "No matching commands" : "No commands found"}</div>`;
    return;
  }

  // Group by scope
  const groups = new Map<string, Command[]>();
  for (const cmd of filtered) {
    const label = cmd.scope === "project" ? "Project Commands" : "Global Commands";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(cmd);
  }

  let h = `<div class="cmd-list-count">${filtered.length} command${filtered.length !== 1 ? "s" : ""}</div>`;

  for (const [label, cmds] of groups) {
    h += `<div class="cmd-group-label">${esc(label)}</div>`;
    for (const cmd of cmds) {
      h += renderCommandItem(cmd, selected?.name === cmd.name && selected?.scope === cmd.scope);
    }
  }

  inner.innerHTML = h;

  bindCommandItems(inner as HTMLElement, filtered, (cmd: Command) => {
    setSelectedCommand(cmd);
    showCommandDetail(container);
  });
}

/**
 * Navigate back to the command list from the detail view.
 *
 * @param container - The DOM element to render the list into
 */
export function showCommandList(container: HTMLElement): void {
  setSelectedCommand(null);
  renderCommandsList(container);
}
