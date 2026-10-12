/**
 * What a right-click in the explorer offers, by what it landed on:
 *
 *   empty space        New folder, Select all, the layouts
 *   a folder           Open, Rename, Remove
 *   one session        the session's own menu, as in the sidebar
 *   a multi-selection  the bulk commands, applied to every selected session
 *
 * Kept apart from the components so the choice is unit-testable without DOM.
 */
import type { ContextMenuItem } from "../../../../../webview/shared/ui";
import { sendCreateFolder, sendRemoveFolder, sendRenameFolder } from "../../api";
import type { ExplorerItem } from "../../lib";
import {
  type ExplorerViewMode,
  deleteSelection,
  exportSelection,
  moveSelection,
  openItem,
  selectAllItems,
  toggleArchiveSelection,
  togglePinSelection,
} from "../../model";
import { buildSessionMenuItems } from "./sessionMenu";

export interface ExplorerMenuContext {
  /** How many items are selected (the target included, when it is an item). */
  selectedCount: number;
  /** Ids of the selected sessions. */
  selectedSessionIds: string[];
  pinned: ReadonlySet<string>;
  archived: ReadonlySet<string>;
  temp: ReadonlySet<string>;
  inArchive: boolean;
  viewMode: ExplorerViewMode;
  setViewMode: (mode: ExplorerViewMode) => void;
}

export function buildExplorerMenu(
  target: ExplorerItem | null,
  ctx: ExplorerMenuContext,
): ContextMenuItem[] {
  if (target === null) {
    return [
      { label: "New folder", icon: "plus", onSelect: () => sendCreateFolder() },
      { label: "Select all", icon: "check", onSelect: selectAllItems },
      {
        label: "Details layout",
        icon: ctx.viewMode === "details" ? "check" : undefined,
        separatorBefore: true,
        onSelect: () => ctx.setViewMode("details"),
      },
      {
        label: "Tiles layout",
        icon: ctx.viewMode === "tiles" ? "check" : undefined,
        onSelect: () => ctx.setViewMode("tiles"),
      },
    ];
  }

  if (ctx.selectedCount > 1) {
    const ids = ctx.selectedSessionIds;
    const allPinned = ids.length > 0 && ids.every((id) => ctx.pinned.has(id));
    const items: ContextMenuItem[] = [];
    if (ids.length > 0) {
      items.push(
        { label: "Move to folder…", icon: "folder", onSelect: moveSelection },
        {
          label: allPinned ? "Unpin" : "Pin",
          icon: allPinned ? "pin-off" : "pin",
          onSelect: togglePinSelection,
        },
        {
          label: ctx.inArchive ? "Restore from archive" : "Archive",
          icon: ctx.inArchive ? "archive-restore" : "archive",
          onSelect: toggleArchiveSelection,
        },
        { label: "Export…", icon: "upload", onSelect: exportSelection },
      );
    }
    items.push({
      label: `Delete ${ctx.selectedCount} items`,
      icon: "trash-2",
      danger: true,
      separatorBefore: items.length > 0,
      onSelect: deleteSelection,
    });
    return items;
  }

  if (target.kind === "folder") {
    return [
      { label: "Open", icon: "folder", onSelect: () => openItem(target) },
      { label: "Rename folder", icon: "pencil", onSelect: () => sendRenameFolder(target.name) },
      {
        label: "Remove folder",
        icon: "x",
        separatorBefore: true,
        onSelect: () => sendRemoveFolder(target.name),
      },
    ];
  }

  const id = target.session.id;
  return buildSessionMenuItems(id, ctx.pinned.has(id), ctx.temp.has(id), ctx.archived.has(id));
}
