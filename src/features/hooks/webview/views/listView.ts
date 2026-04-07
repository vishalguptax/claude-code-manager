/**
 * Hooks list view — renders the hook list grouped by event type.
 */

import { esc } from "../../../../webview/utils";
import { getAllHooks, getHooksByEvent } from "../state";
import { renderHookItem } from "../components/hookItem";

/** Map event names to user-friendly display labels. */
const EVENT_LABELS: Record<string, string> = {
  PreToolUse: "Pre Tool Use",
  PostToolUse: "Post Tool Use",
  Notification: "Notification",
  Stop: "Stop",
  SubagentStop: "Subagent Stop",
};

/**
 * Render the hooks list into the given container.
 * Groups hooks by event type with descriptive headers.
 * Shows an empty state when no hooks are configured.
 *
 * @param container - The DOM element to render into
 */
export function renderHooksList(container: HTMLElement): void {
  const hooks = getAllHooks();

  if (hooks.length === 0) {
    container.innerHTML = `
      <div class="hook-empty">
        <div class="hook-empty-title">No hooks configured</div>
        <div class="hook-empty-desc">
          Hooks are defined in <code>~/.claude/settings.json</code> under the <code>hooks</code> key.<br><br>
          Each hook has an event type (e.g. <code>PreToolUse</code>), an optional <code>matcher</code>,
          and a <code>command</code> to execute.<br><br>
          Example:
          <pre class="hook-example">
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write", "command": "echo 'Writing...'" }
    ]
  }
}</pre>
        </div>
      </div>`;
    return;
  }

  const groups = getHooksByEvent();

  let h = `<div class="hook-list-count">${hooks.length} hook${hooks.length !== 1 ? "s" : ""}</div>`;

  for (const [event, eventHooks] of groups) {
    const label = EVENT_LABELS[event] ?? event;
    h += `<div class="hook-group-label">${esc(label)}</div>`;
    for (const hook of eventHooks) {
      h += renderHookItem(hook);
    }
  }

  container.innerHTML = h;
}
