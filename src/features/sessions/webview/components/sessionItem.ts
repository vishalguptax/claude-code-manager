/**
 * Session item component -- renders a single session row in the list.
 */

import { icon } from "../../../../webview/icons";
import { esc, fmtTime } from "../../../../webview/utils";
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
  const time = fmtTime(s.endTime);
  const firstPrompt = s.prompts[0] ?? "";
  const showSubPrompt = Boolean(s.name && firstPrompt);

  return `
    <div class="item session-item ${isActive ? "active" : ""}" data-id="${s.id}">
      <div class="item-row1">
        <span class="item-name" title="${esc(name)}">${esc(name)}</span>
        <span class="item-time">${time}</span>
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
export function bindSessionItems(
  container: HTMLElement,
  pinnedIds: Set<string>,
  callbacks: {
    onSelect: (id: string) => void;
    onContextMenu: (e: MouseEvent, id: string, isPinned: boolean) => void;
    onResume: (id: string) => void;
  },
): void {
  container.querySelectorAll(".session-item").forEach((el) => {
    el.addEventListener("click", (e: Event) => {
      if ((e.target as HTMLElement).closest(".item-resume")) return;
      const id = (el as HTMLElement).dataset.id;
      if (!id) return;
      callbacks.onSelect(id);
    });

    el.addEventListener("contextmenu", (e: Event) => {
      e.preventDefault();
      const id = (el as HTMLElement).dataset.id;
      if (!id) return;
      const isPinned = pinnedIds.has(id);
      callbacks.onContextMenu(e as MouseEvent, id, isPinned);
    });
  });

  container.querySelectorAll("[data-resume]").forEach((btn) =>
    btn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.resume;
      if (!id) return;
      callbacks.onResume(id);
    })
  );
}
