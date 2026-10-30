/**
 * Builds the action-menu items for a session row. Restores the v1
 * `contextMenu.ts` action set (8 actions) and wires each to its host message:
 *
 *   Open in editor       → openSessionPanel (detail in its own editor tab)
 *   Rename               → renameSession   (host opens a native input box)
 *   Pin / Unpin          → pinSession / unpinSession
 *   Move to folder…      → moveToFolder    (host opens a native QuickPick)
 *   Fork & Resume        → forkSession
 *   Copy resume command  → copyCommand     (host copies `claude --resume <id>`)
 *   Copy session ID      → navigator.clipboard (webview-local, no host round-trip)
 *   Export session…      → exportSession   (host Save dialog)
 *   Archive / Unarchive  → archiveSession / unarchiveSession
 *   Delete session       → confirmDelete   (host confirm, deletes it from disk)
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
  sendMoveToFolder,
  sendOpenSessionPanel,
  sendPinSession,
  sendPromoteTemp,
  sendRemoveFolder,
  sendRenameFolder,
  sendRenameSession,
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
      label: "Open in editor",
      icon: "maximize-2",
      onSelect: () => sendOpenSessionPanel(sessionId),
    },
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
      label: "Move to folder…",
      icon: "folder",
      onSelect: () => sendMoveToFolder([sessionId]),
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

/**
 * Actions for a folder's section header. Removing a folder is not marked
 * dangerous: it only unfiles the sessions, which return to the date sections.
 */
export function buildFolderMenuItems(folder: string): ContextMenuItem[] {
  return [
    { label: "Rename folder", icon: "pencil", onSelect: () => sendRenameFolder(folder) },
    { label: "Remove folder", icon: "x", onSelect: () => sendRemoveFolder(folder) },
  ];
}
