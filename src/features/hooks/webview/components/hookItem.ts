/**
 * Hook item component — renders a single hook row in the list.
 */

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

  const scopeLabel = hook.scope === "global" ? "Global" : hook.scope === "project" ? "Project" : "Local";

  return `
    <div class="hook-item" data-hook-index="${index}" tabindex="0">
      <div class="hook-item-row1">
        ${hook.matcher ? `<span class="hook-matcher" title="Matcher: ${esc(hook.matcher)}">${esc(hook.matcher)}</span>` : `<span class="hook-matcher hook-matcher-all">*</span>`}
        <span class="scope-badge ${hook.scope}">${scopeLabel}</span>
      </div>
      <div class="hook-item-command">
        <code>${esc(commandPreview)}</code>
      </div>
    </div>`;
}
