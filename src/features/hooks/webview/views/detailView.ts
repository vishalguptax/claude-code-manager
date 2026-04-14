/**
 * Hooks detail view — shows the full event, matcher, command, and scope
 * for a selected hook, with copy-command and open-in-file actions.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendOpenHookSettingsFile } from "../api";
import { getSelectedHook, setSelectedHook } from "../state";
import { renderHooksList } from "./listView";

/** Map event names to user-friendly display labels. */
const EVENT_LABELS: Record<string, string> = {
  PreToolUse: "Pre Tool Use",
  PostToolUse: "Post Tool Use",
  Notification: "Notification",
  Stop: "Stop",
  SubagentStop: "Subagent Stop",
};

/** Map scope to user-visible label. */
const SCOPE_LABELS: Record<string, string> = {
  global: "Global",
  project: "Project",
  local: "Local",
};

/**
 * Render the hook detail panel into the given container.
 */
export function showHookDetail(container: HTMLElement): void {
  const hook = getSelectedHook();
  if (!hook) {
    renderHooksList(container);
    return;
  }

  const eventLabel = EVENT_LABELS[hook.event] ?? hook.event;
  const scopeLabel = SCOPE_LABELS[hook.scope] ?? hook.scope;
  const matcherDisplay = hook.matcher || "* (any)";

  container.innerHTML = `<div class="panel">
    <button class="back-btn" id="hookGoBack">${icon("arrow-left")} Back</button>

    <div class="d-head">
      <div class="d-title">${esc(eventLabel)}</div>
      <div class="d-tags">
        <span class="scope-badge ${esc(hook.scope)}">${esc(scopeLabel)}</span>
        <span class="tag">matcher: ${esc(matcherDisplay)}</span>
      </div>
    </div>

    <div class="d-actions">
      <button class="btn primary" id="hookCopy">${icon("copy")} Copy command</button>
      <button class="btn" id="hookOpenFile">${icon("external-link")} Open settings file</button>
    </div>

    <div class="d-scroll">
      <div class="d-section">
        <div class="d-label">Event</div>
        <div class="d-kv"><span class="d-k">Type</span><span class="d-v">${esc(eventLabel)}</span></div>
        <div class="d-kv"><span class="d-k">Matcher</span><span class="d-v mono">${esc(matcherDisplay)}</span></div>
        <div class="d-kv"><span class="d-k">Scope</span><span class="d-v">${esc(scopeLabel)}</span></div>
      </div>

      <div class="d-section">
        <div class="d-label">Command</div>
        <pre class="hook-command-block"><code>${esc(hook.command)}</code></pre>
      </div>
    </div>
  </div>`;

  container.querySelector("#hookGoBack")?.addEventListener("click", () => {
    setSelectedHook(null);
    renderHooksList(container);
  });

  container.querySelector("#hookCopy")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(hook.command);
    const btn = container.querySelector<HTMLElement>("#hookCopy");
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `${icon("copy")} Copied!`;
      setTimeout(() => { btn.innerHTML = orig; }, 1200);
    }
  });

  container.querySelector("#hookOpenFile")?.addEventListener("click", () => {
    sendOpenHookSettingsFile(hook.scope);
  });
}
