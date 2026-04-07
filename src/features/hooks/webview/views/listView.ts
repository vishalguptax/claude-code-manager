/**
 * Hooks list view — renders the hook list with search, grouped by event type.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendGetHooks } from "../api";
import {
  getAllHooks,
  getFilteredHooks,
  getFilteredHooksByEvent,
  getSearchQuery,
  setSearchQuery,
} from "../state";
import { renderHookItem } from "../components/hookItem";

/** Map event names to user-friendly display labels. */
const EVENT_LABELS: Record<string, string> = {
  PreToolUse: "Pre Tool Use",
  PostToolUse: "Post Tool Use",
  Notification: "Notification",
  Stop: "Stop",
  SubagentStop: "Subagent Stop",
};

let _searchTimer: ReturnType<typeof setTimeout>;

/**
 * Render the hooks list into the given container.
 * Includes a search bar, refresh button, and hooks grouped by event type.
 * Shows an empty state when no hooks are configured.
 *
 * @param container - The DOM element to render into
 */
export function renderHooksList(container: HTMLElement): void {
  const hooks = getAllHooks();
  const searchQuery = getSearchQuery();

  let shell = `
    <div class="actions-bar">
      <button class="action-btn icon-only" id="hookRefresh" title="Refresh hooks">${icon("refresh-cw")}</button>
    </div>
    <div class="feature-search">
      <input id="hookSearch" type="text" placeholder="Search hooks..." value="${esc(searchQuery)}" />
      <div class="search-actions">
        <button class="search-btn ${searchQuery ? "" : "is-hidden"}" id="hookSearchClear" title="Clear (Esc)">${icon("x", 14)}</button>
      </div>
    </div>
    <div id="hookListInner"></div>`;

  container.innerHTML = shell;

  // Bind search
  const searchInput = container.querySelector("#hookSearch") as HTMLInputElement | null;
  const clearBtn = container.querySelector("#hookSearchClear");

  searchInput?.addEventListener("input", () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const q = searchInput.value.toLowerCase();
      setSearchQuery(q);
      clearBtn?.classList.toggle("is-hidden", !q);
      updateHooksListInner(container);
    }, 150);
  });

  searchInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      setSearchQuery("");
      clearBtn?.classList.add("is-hidden");
      updateHooksListInner(container);
      searchInput.focus();
    }
  });

  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    setSearchQuery("");
    clearBtn?.classList.add("is-hidden");
    updateHooksListInner(container);
    searchInput?.focus();
  });

  // Bind refresh
  container.querySelector("#hookRefresh")?.addEventListener("click", () => sendGetHooks());

  // Render inner list
  updateHooksListInner(container);
}

/**
 * Update just the inner hook list items without rebuilding the full shell.
 * @param container - The parent DOM element containing #hookListInner
 */
function updateHooksListInner(container: HTMLElement): void {
  const inner = container.querySelector("#hookListInner");
  if (!inner) return;

  const allHooks = getAllHooks();
  const searchQuery = getSearchQuery();

  if (allHooks.length === 0) {
    inner.innerHTML = `
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

  const filtered = getFilteredHooks();

  if (filtered.length === 0) {
    inner.innerHTML = `<div class="empty">No matching hooks</div>`;
    return;
  }

  const groups = getFilteredHooksByEvent();

  let h = `<div class="hook-list-count">${filtered.length} hook${filtered.length !== 1 ? "s" : ""}</div>`;

  for (const [event, eventHooks] of groups) {
    const label = EVENT_LABELS[event] ?? event;
    h += `<div class="hook-group-label">${esc(label)}</div>`;
    for (const hook of eventHooks) {
      h += renderHookItem(hook);
    }
  }

  inner.innerHTML = h;
}
