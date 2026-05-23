/**
 * The strip above the session list. At rest it shows the session count and a
 * "Select" toggle; in bulk mode it becomes a toolbar with pin/unpin, export,
 * delete, and cancel actions scoped to the current selection.
 */
import { Icon } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import { sendBulkDeleteSessions, sendBulkExportSessions, sendBulkPinSessions } from "../../api";
import {
  bulkModeSignal,
  clearSelection,
  pinnedSignal,
  selectionSignal,
  setBulkMode,
} from "../../model";

export interface ListHeaderProps {
  totalCount: number;
}

export function ListHeader({ totalCount }: ListHeaderProps) {
  const bulk = bulkModeSignal.value;
  const selection = selectionSignal.value;
  const pinned = pinnedSignal.value;
  const count = selection.size;

  if (!bulk) {
    return (
      <div class="list-header" role="toolbar" aria-label="Session list header">
        <span class="list-header-label">
          {totalCount} session{totalCount !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          class="list-count-toggle"
          title="Enter bulk-select mode"
          onClick={() => setBulkMode(true)}
        >
          <Icon name="check" size={12} /> Select
        </button>
      </div>
    );
  }

  let allPinned = count > 0;
  for (const id of selection) {
    if (!pinned.has(id)) {
      allPinned = false;
      break;
    }
  }
  const pinLabel = allPinned ? "Unpin" : "Pin";
  const pinIcon = allPinned ? "pin-off" : "pin";
  const ids = (): string[] => Array.from(selection);

  return (
    <div
      class={cx("list-header", "list-header-bulk")}
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span class="list-header-label">{count} selected</span>
      <button
        type="button"
        class="bulk-btn"
        disabled={count === 0}
        onClick={() => count > 0 && sendBulkPinSessions(ids(), !allPinned)}
      >
        <Icon name={pinIcon} size={12} /> {pinLabel}
      </button>
      <button
        type="button"
        class="bulk-btn"
        disabled={count === 0}
        onClick={() => count > 0 && sendBulkExportSessions(ids())}
      >
        <Icon name="download" size={12} /> Export
      </button>
      <button
        type="button"
        class="bulk-btn del"
        disabled={count === 0}
        onClick={() => count > 0 && sendBulkDeleteSessions(ids())}
      >
        <Icon name="trash-2" size={12} /> Delete
      </button>
      <button type="button" class="bulk-btn" title="Exit bulk mode" onClick={() => clearSelection()}>
        <Icon name="x" size={12} /> Cancel
      </button>
    </div>
  );
}
