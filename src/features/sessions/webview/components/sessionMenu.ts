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
 *   Delete session       → confirmDelete   (host confirm, then userState update)
 *
 * Kept separate from the row component so the action wiring is unit-testable
 * without rendering DOM, and so the ListView only deals with menu placement.
 */
import type { ContextMenuItem } from "../../../../webview/components/ContextMenu";
import {
  sendConfirmDelete,
  sendCopyCommand,
  sendExportSession,
  sendForkSession,
  sendPinSession,
  sendRenameSession,
  sendUnpinSession,
} from "../api";

/**
 * Construct the ordered menu items for one session. `isPinned` flips the
 * pin/unpin row's label, icon, and target message — matching v1.
 */
export function buildSessionMenuItems(sessionId: string, isPinned: boolean): ContextMenuItem[] {
  return [
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
    {
      label: "Delete session",
      icon: "trash-2",
      danger: true,
      separatorBefore: true,
      onSelect: () => sendConfirmDelete(sessionId),
    },
  ];
}
