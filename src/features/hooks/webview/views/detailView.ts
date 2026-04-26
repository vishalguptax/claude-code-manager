/**
 * Hooks detail view — shows the full event, matcher, command, and scope
 * for a selected hook, with copy-command and open-in-file actions.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import {
  sendOpenHookSettingsFile,
  sendToggleHookEnabled,
  sendDeleteHook,
  sendUpdateHook,
} from "../api";
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

  const toggleLabel = hook.disabled ? "Enable" : "Disable";
  const toggleIcon = hook.disabled ? "play" : "pin-off";

  container.innerHTML = `<div class="panel">
    <button class="back-btn" id="hookGoBack">${icon("arrow-left")} Back</button>

    <div class="d-head">
      <div class="d-title">${esc(eventLabel)}</div>
      <div class="d-tags">
        <span class="scope-badge ${esc(hook.scope)}">${esc(scopeLabel)}</span>
        <span class="tag">matcher: ${esc(matcherDisplay)}</span>
        ${hook.disabled ? `<span class="hook-disabled-badge">disabled</span>` : ""}
      </div>
    </div>

    <div class="d-actions">
      <button class="btn" id="hookEdit">${icon("pencil")} Edit</button>
      <button class="btn" id="hookToggle">${icon(toggleIcon)} ${toggleLabel}</button>
      <button class="btn primary" id="hookCopy">${icon("copy")} Copy command</button>
      <button class="btn" id="hookOpenFile">${icon("external-link")} Open settings file</button>
      <button class="btn del" id="hookDelete">${icon("trash-2")} Delete</button>
    </div>

    <div class="d-scroll" id="hookDetailScroll">
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

  container.querySelector("#hookToggle")?.addEventListener("click", () => {
    sendToggleHookEnabled(hook);
  });

  container.querySelector("#hookDelete")?.addEventListener("click", () => {
    sendDeleteHook(hook);
  });

  container.querySelector("#hookEdit")?.addEventListener("click", () => {
    renderEditForm(container, hook);
  });
}

/**
 * Replace the detail body with an inline edit form. Saving fires
 * `updateHook` and the host's reply re-renders the detail surface
 * via the regular `hooks` message round-trip.
 */
function renderEditForm(container: HTMLElement, hook: import("../../types").Hook): void {
  const scroll = container.querySelector<HTMLElement>("#hookDetailScroll");
  if (!scroll) return;
  scroll.innerHTML = `
    <div class="d-section">
      <div class="d-label">Edit hook</div>
      <div class="acct-field">
        <label class="acct-label" for="hookEditMatcher">Matcher</label>
        <input class="acct-input" id="hookEditMatcher" type="text" value="${esc(hook.matcher)}" placeholder="Tool name or pattern (blank = match all)">
      </div>
      <div class="acct-field">
        <label class="acct-label" for="hookEditCommand">Command</label>
        <textarea class="acct-input hook-edit-command" id="hookEditCommand" rows="4" placeholder="Shell command to run">${esc(hook.command)}</textarea>
      </div>
      <div class="d-actions">
        <button class="btn primary" id="hookEditSave">${icon("check")} Save</button>
        <button class="btn" id="hookEditCancel">${icon("x")} Cancel</button>
      </div>
    </div>`;

  scroll.querySelector("#hookEditCancel")?.addEventListener("click", () => {
    showHookDetail(container);
  });
  scroll.querySelector("#hookEditSave")?.addEventListener("click", () => {
    const matcher = (scroll.querySelector<HTMLInputElement>("#hookEditMatcher")?.value ?? "").trim();
    const command = (scroll.querySelector<HTMLTextAreaElement>("#hookEditCommand")?.value ?? "").trim();
    if (!command) return;
    sendUpdateHook(hook, { matcher, command });
  });
}
