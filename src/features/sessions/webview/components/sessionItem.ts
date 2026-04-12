/**
 * Session item component -- renders a single session row in the list.
 */

import { icon } from "../../../../webview/icons";
import { esc, fmtRelativeTime } from "../../../../webview/utils";
import type { Session } from "../../types";

/**
 * Render a single session list item as an HTML string.
 *
 * @param s - The session to render
 * @param isActive - Whether this session is currently selected
 * @param isPinned - Whether this session is pinned
 * @returns HTML string for the session item
 */
export function renderSessionItem(s: Session, isActive: boolean, isPinned: boolean): string {
  // When the session has a user-set rename, the rename is the title and the
  // first prompt is shown as a dim subtitle. When there is no rename, the
  // first prompt itself becomes the title (CSS truncates it on narrow widths).
  const name = s.name || s.prompts[0] || "Untitled session";
  const branch = s.branch && s.branch !== "HEAD" ? s.branch : "";
  const relTime = fmtRelativeTime(s.endTime);
  // Full absolute date shown as tooltip on hover
  const absDate = new Date(s.endTime).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const firstPrompt = s.prompts[0] ?? "";
  const showSubPrompt = Boolean(s.name && firstPrompt);

  return `
    <div class="item session-item ${isActive ? "active" : ""}" data-id="${s.id}">
      <div class="item-row1">
        <span class="item-name" title="${esc(name)}">${esc(name)}</span>
        <span class="item-time" title="${esc(absDate)}">${esc(relTime)}</span>
      </div>
      <button class="item-resume" data-resume="${s.id}" title="Resume session">${icon("play")}</button>
      ${showSubPrompt ? `<div class="item-prompt" title="${esc(firstPrompt)}">${esc(firstPrompt)}</div>` : ""}
      <div class="item-row2">
        ${isPinned ? `<span class="pin-icon">${icon("pin")}</span>` : ""}
        ${s.entrypoint === "vscode" ? `<span class="item-ep">ext</span>` : ""}
        ${branch ? `<span class="tag">${esc(branch)}</span>` : ""}
        <span class="item-proj">${esc(s.project)}</span>
      </div>
    </div>`;
}

/**
 * Bind click, context-menu, and resume handlers on session items in a container.
 *
 * @param container - The DOM element containing session items
 * @param pinnedIds - Set of currently pinned session IDs
 * @param callbacks - Event handler callbacks
 */
/**
 * Bind click, context-menu, and resume handlers on session items using
 * event delegation. A single listener per event type on the container
 * handles all items, avoiding O(n) listener creation on each render.
 *
 * Call this once during mount — delegation survives innerHTML updates.
 * Uses getPinnedIds getter so the context menu always reads fresh state.
 */
export function bindSessionItems(
  container: HTMLElement,
  getPinnedIds: () => Set<string>,
  callbacks: {
    onSelect: (id: string) => void;
    onContextMenu: (e: MouseEvent, id: string, isPinned: boolean) => void;
    onResume: (id: string) => void;
  },
): void {
  container.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;

    // "Show more" button
    if (target.id === "showMore" || target.closest("#showMore")) return;

    // Resume button
    const resumeBtn = target.closest("[data-resume]") as HTMLElement | null;
    if (resumeBtn) {
      e.stopPropagation();
      const id = resumeBtn.dataset.resume;
      if (id) callbacks.onResume(id);
      return;
    }

    // Session item click
    const item = target.closest(".session-item") as HTMLElement | null;
    if (item?.dataset.id) {
      callbacks.onSelect(item.dataset.id);
    }
  });

  container.addEventListener("contextmenu", (e: Event) => {
    const item = (e.target as HTMLElement).closest(".session-item") as HTMLElement | null;
    if (!item?.dataset.id) return;
    e.preventDefault();
    const id = item.dataset.id;
    callbacks.onContextMenu(e as MouseEvent, id, getPinnedIds().has(id));
  });
}
