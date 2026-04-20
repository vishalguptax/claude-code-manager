/**
 * Command item component — renders a single command row in the list.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { isClaudeCodeExtensionInstalled } from "../../../../webview/extensionStatus";
import { sendLaunchCommandInChat } from "../api";
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

  const chatBtn = isClaudeCodeExtensionInstalled()
    ? `<button class="item-chat-btn" data-chat-name="${esc(cmd.name)}" title="Launch /${esc(cmd.name)} in Claude Code chat">${icon("message-square", 14)}</button>`
    : "";

  return `
    <div class="cmd-item ${isActive ? "active" : ""}" data-cmd-name="${esc(cmd.name)}" data-cmd-scope="${cmd.scope}">
      <div class="cmd-item-row1">
        <span class="cmd-item-name">/${esc(cmd.name)}</span>
        ${chatBtn}
        <button class="item-copy-btn" data-copy-name="/${esc(cmd.name)}" title="Copy /${esc(cmd.name)}">${icon("copy", 14)}</button>
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
/**
 * Bind click handlers on command items using event delegation.
 */
export function bindCommandItems(
  container: HTMLElement,
  commands: import("../../types").Command[],
  onSelect: (cmd: import("../../types").Command) => void,
): void {
  container.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;

    // Launch-in-chat button (only rendered when extension is installed).
    const chatBtn = target.closest(".item-chat-btn") as HTMLElement | null;
    if (chatBtn) {
      e.stopPropagation();
      const name = chatBtn.dataset.chatName;
      if (name) sendLaunchCommandInChat(name);
      return;
    }

    // Copy button
    const copyBtn = target.closest(".item-copy-btn") as HTMLElement | null;
    if (copyBtn) {
      e.stopPropagation();
      const name = copyBtn.dataset.copyName;
      if (name) {
        navigator.clipboard?.writeText(name);
        copyBtn.classList.add("copied");
        setTimeout(() => copyBtn.classList.remove("copied"), 1000);
      }
      return;
    }

    // Command item click
    const item = target.closest(".cmd-item") as HTMLElement | null;
    if (item) {
      const cmdName = item.dataset.cmdName;
      const scope = item.dataset.cmdScope;
      const cmd = commands.find((c) => c.name === cmdName && c.scope === scope);
      if (cmd) onSelect(cmd);
    }
  });
}
