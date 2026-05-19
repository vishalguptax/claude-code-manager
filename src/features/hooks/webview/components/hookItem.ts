/**
 * Hook item component — renders a single hook row in the list.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import type { Hook } from "../../types";

/**
 * Render a single hook list item as an HTML string.
 * Shows the event type, matcher pattern, and shell command.
 *
 * @param hook - The hook to render
 * @param index - Index of the hook in the full list (for click lookup)
 * @returns HTML string for the hook item
 */
export function renderHookItem(hook: Hook, index: number): string {
  const commandPreview = hook.command.length > 60
    ? hook.command.slice(0, 60) + "..."
    : hook.command;

  const scopeLabel =
    hook.scope === "global"
      ? "Global"
      : hook.scope === "project"
        ? "Project"
        : hook.scope === "plugin"
          ? `Plugin: ${hook.pluginName ?? "unknown"}`
          : "Local";
  const toggleTitle = hook.disabled ? "Enable hook" : "Disable hook";
  const toggleIcon = hook.disabled ? "play" : "pin-off";
  const stateClass = hook.disabled ? "is-disabled" : "";

  // Plugin hooks are owned by the plugin manifest — they cannot be
  // toggled or deleted from this view because the writer refuses to
  // mutate plugin scope. Hide the action buttons entirely instead of
  // showing buttons that silently no-op on click.
  const actionsHtml = hook.scope === "plugin"
    ? `<span class="hook-readonly-badge" title="Owned by plugin ${esc(hook.pluginName ?? "")}">read-only</span>`
    : `<span class="hook-item-actions">
        <button class="hook-action-btn" data-hook-action="toggle" title="${toggleTitle}">${icon(toggleIcon, 12)}</button>
        <button class="hook-action-btn del" data-hook-action="delete" title="Delete hook">${icon("trash-2", 12)}</button>
      </span>`;

  return `
    <div class="hook-item ${stateClass}" data-hook-index="${index}" tabindex="0">
      <div class="hook-item-row1">
        ${hook.matcher ? `<span class="hook-matcher" title="Matcher: ${esc(hook.matcher)}">${esc(hook.matcher)}</span>` : `<span class="hook-matcher hook-matcher-all">*</span>`}
        <span class="scope-badge ${hook.scope}" title="${esc(scopeLabel)}">${esc(scopeLabel)}</span>
        ${hook.disabled ? `<span class="hook-disabled-badge">disabled</span>` : ""}
        ${actionsHtml}
      </div>
      <div class="hook-item-command">
        <code>${esc(commandPreview)}</code>
      </div>
    </div>`;
}
