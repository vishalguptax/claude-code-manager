/**
 * Commands list view — renders the command list grouped by scope,
 * with click-to-select navigation to the detail view.
 */

import { esc } from "../../../../webview/utils";
import {
  getAllCommands,
  getCommandsByScope,
  getSelectedCommand,
  setSelectedCommand,
} from "../state";
import { renderCommandItem, bindCommandItems } from "../components/commandItem";
import { showCommandDetail } from "./detailView";
import type { Command } from "../../types";

/**
 * Render the commands list into the given container.
 * Groups commands by scope (project first, then global).
 * Shows an empty state when no commands are found.
 *
 * @param container - The DOM element to render into
 */
export function renderCommandsList(container: HTMLElement): void {
  const commands = getAllCommands();
  const selected = getSelectedCommand();

  if (commands.length === 0) {
    container.innerHTML = `
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

  const projectCmds = getCommandsByScope("project");
  const globalCmds = getCommandsByScope("global");

  let h = `<div class="cmd-list-count">${commands.length} command${commands.length !== 1 ? "s" : ""}</div>`;

  if (projectCmds.length > 0) {
    h += `<div class="cmd-group-label">Project Commands</div>`;
    for (const cmd of projectCmds) {
      h += renderCommandItem(cmd, selected?.name === cmd.name && selected?.scope === cmd.scope);
    }
  }

  if (globalCmds.length > 0) {
    h += `<div class="cmd-group-label">Global Commands</div>`;
    for (const cmd of globalCmds) {
      h += renderCommandItem(cmd, selected?.name === cmd.name && selected?.scope === cmd.scope);
    }
  }

  container.innerHTML = h;

  bindCommandItems(container, commands, (cmd: Command) => {
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
