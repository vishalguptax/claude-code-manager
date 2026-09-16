/**
 * Builds the action-menu items for a session row. Restores the v1
 * `contextMenu.ts` action set (8 actions) and wires each to its host message:
 *
 *   Rename               → renameSession   (host opens a native input box)
 *   Pin / Unpin          → pinSession / unpinSession
 *   Fork & Resume        → forkSession
 *   Copy resume command  → copyCommand     (host copies `claude --resume <id>`)
 *   Copy session ID      → navigator.clipboard (webview-local, no host round-trip)
 *   Export session…      → exportSession   (host Save dialog)
 *   Archive / Unarchive  → archiveSession / unarchiveSession
 *   Mark unread          → markSessionUnread
 *   Delete session       → confirmDelete   (host confirm, then userState update)
 *
 * Kept separate from the row component so the action wiring is unit-testable
 * without rendering DOM, and so the ListView only deals with menu placement.
 */
import type { ContextMenuItem } from "../../../../../webview/shared/ui";
import {
  sendArchiveSession,
  sendConfirmDelete,
  sendCopyCommand,
  sendExportSession,
  sendForkSession,
  sendPinSession,
  sendPromoteTemp,
  sendRenameSession,
  sendMarkSessionUnread,
  sendUnarchiveSession,
  sendUnpinSession,
} from "../../api";

/**
 * Construct the ordered menu items for one session. `isPinned` flips the
 * pin/unpin row's label, icon, and target message — matching v1. `isTemp`
 * adds a "Make permanent" action that keeps an ephemeral session's transcript.
 */
export function buildSessionMenuItems(
  sessionId: string,
  isPinned: boolean,
  isTemp = false,
  isArchived = false,
  isUnread = false,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  if (isTemp) {
    items.push({
      label: "Make permanent",
      icon: "save",
      onSelect: () => sendPromoteTemp(sessionId),
    });
  }
  items.push(
    {
      label: "Rename session",
      icon: "pencil",
      onSelect: () => sendRenameSession(sessionId),
    },
    {
      label: isPinned ? "Unpin" : "Pin to top",
      icon: isPinned ? "pin-off" : "pin",
      onSelect: () => (isPinned ? sendUnpinSession(sessionId) : sendPinSession(sessionId)),
    },
    {
      label: "Fork & Resume",
      icon: "git-fork",
      onSelect: () => sendForkSession(sessionId),
    },
    {
      label: "Copy resume command",
      icon: "terminal",
      onSelect: () => sendCopyCommand(sessionId),
    },
    {
      label: "Copy session ID",
      icon: "copy",
      onSelect: () => {
        void navigator.clipboard?.writeText(sessionId);
      },
    },
    {
      label: "Export session…",
      icon: "upload",
      separatorBefore: true,
      onSelect: () => sendExportSession(sessionId),
    },
    // Only offered for a session that currently reads as read — marking an
    // already-unread session unread is a no-op the user would have to think
    // about to discover.
    ...(isUnread
      ? []
      : [
          {
            label: "Mark as unread",
            icon: "eye-off",
            onSelect: () => sendMarkSessionUnread(sessionId),
          } satisfies ContextMenuItem,
        ]),
    {
      label: isArchived ? "Unarchive" : "Archive",
      icon: isArchived ? "archive-restore" : "archive",
      onSelect: () =>
        isArchived ? sendUnarchiveSession(sessionId) : sendArchiveSession(sessionId),
    },
    {
      label: "Delete session",
      icon: "trash-2",
      danger: true,
      separatorBefore: true,
      onSelect: () => sendConfirmDelete(sessionId),
    },
  );
  return items;
}
