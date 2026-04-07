/**
 * Context menu — right-click menu for session list items.
 * Provides pin, fork, copy, and delete actions.
 */

import { icon } from "../icons";
import {
  sendPinSession,
  sendUnpinSession,
  sendForkSession,
  sendCopyCommand,
  sendConfirmDelete,
} from "../api";

/**
 * Show a context menu at the mouse position for a given session.
 * Closes any previously open context menu first.
 *
 * @param e - The mouse event that triggered the context menu
 * @param sessionId - The session ID to act on
 * @param isPinned - Whether the session is currently pinned
 */
export function showContextMenu(e: MouseEvent, sessionId: string, isPinned: boolean): void {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctxMenu";
  menu.innerHTML = `
    <div class="ctx-item" data-action="pin"><span class="ctx-icon">${icon(isPinned ? "pin-off" : "pin")}</span>${isPinned ? "Unpin" : "Pin to top"}</div>
    <div class="ctx-item" data-action="fork"><span class="ctx-icon">${icon("git-fork")}</span>Fork &amp; Resume</div>
    <div class="ctx-item" data-action="copyCmd"><span class="ctx-icon">${icon("terminal")}</span>Copy resume command</div>
    <div class="ctx-item" data-action="copyId"><span class="ctx-icon">${icon("copy")}</span>Copy session ID</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item del" data-action="delete"><span class="ctx-icon">${icon("trash-2")}</span>Delete session</div>
  `;

  document.body.appendChild(menu);

  const rect = document.body.getBoundingClientRect();
  const x = e.clientX;
  const y = e.clientY;
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  // Adjust if overflows viewport
  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect();
    if (mr.right > rect.right) menu.style.left = (x - mr.width) + "px";
    if (mr.bottom > rect.bottom) menu.style.top = (y - mr.height) + "px";
  });

  menu.querySelectorAll(".ctx-item").forEach((item) => {
    item.addEventListener("click", () => {
      const action = (item as HTMLElement).dataset.action;
      switch (action) {
        case "pin":
          if (isPinned) {
            sendUnpinSession(sessionId);
          } else {
            sendPinSession(sessionId);
          }
          break;
        case "fork":
          sendForkSession(sessionId);
          break;
        case "copyCmd":
          sendCopyCommand(sessionId);
          break;
        case "copyId":
          navigator.clipboard?.writeText(sessionId);
          break;
        case "delete":
          confirmDelete(sessionId);
          break;
      }
      closeContextMenu();
    });
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener("click", closeContextMenu, { once: true });
  }, 0);
}

/**
 * Remove the context menu from the DOM if it exists.
 */
export function closeContextMenu(): void {
  document.getElementById("ctxMenu")?.remove();
}

/**
 * Request deletion confirmation from the extension for a session.
 * Optionally calls a callback (via the extension) after deletion.
 *
 * @param sessionId - The session ID to delete
 * @param onDone - Optional callback to invoke after deletion completes
 */
export function confirmDelete(sessionId: string, onDone?: () => void): void {
  closeContextMenu();
  sendConfirmDelete(sessionId, onDone ? "showList" : undefined);
}
