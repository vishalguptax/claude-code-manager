/**
 * Command item component — renders a single command row in the list.
 */

import { esc } from "../../../../webview/utils";
import type { Command } from "../../types";

/**
 * Render a single command list item as an HTML string.
 * Built-in commands show their `description`; custom commands show a
 * preview of the markdown content.
 *
 * @param cmd - The command to render
 * @param isActive - Whether this command is currently selected
 * @returns HTML string for the command item
 */
export function renderCommandItem(cmd: Command, isActive: boolean): string {
  const previewSource = cmd.scope === "builtin" ? cmd.description ?? "" : cmd.content;
  const preview =
    previewSource.length > 80
      ? previewSource.slice(0, 80).replace(/\n/g, " ") + "..."
      : previewSource.replace(/\n/g, " ");

  return `
    <div class="cmd-item ${isActive ? "active" : ""}" data-cmd-name="${esc(cmd.name)}" data-cmd-scope="${cmd.scope}">
      <div class="cmd-item-row1">
        <span class="cmd-item-name">/${esc(cmd.name)}</span>
        <span class="cmd-scope-badge cmd-scope-${cmd.scope}">${cmd.scope}</span>
      </div>
      <div class="cmd-item-preview">${esc(preview)}</div>
    </div>`;
}

/**
 * Bind click handlers on command items in a container.
 *
 * @param container - The DOM element containing command items
 * @param commands - The full list of commands (used for lookup)
 * @param onSelect - Callback when a command is selected
 */
export function bindCommandItems(
  container: HTMLElement,
  commands: import("../../types").Command[],
  onSelect: (cmd: import("../../types").Command) => void,
): void {
  container.querySelectorAll(".cmd-item").forEach((el) => {
    el.addEventListener("click", () => {
      const name = (el as HTMLElement).dataset.cmdName;
      const scope = (el as HTMLElement).dataset.cmdScope;
      const cmd = commands.find((c) => c.name === name && c.scope === scope);
      if (cmd) onSelect(cmd);
    });
  });
}
