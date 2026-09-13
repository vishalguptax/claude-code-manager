/**
 * The strip above the session list. At rest it shows the session count and a
 * "Select" toggle; in bulk mode it becomes a toolbar with pin/unpin, export,
 * delete, and cancel actions scoped to the current selection.
 */
import { useRef } from "preact/hooks";
import { useEdgeAutoScroll } from "../../../../../webview/shared/hooks";
import { Button, Icon } from "../../../../../webview/shared/ui";
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
  // In bulk mode this strip holds four actions and a count, and it scrolls
  // sideways with its scrollbar hidden — same problem the tab strip has.
  const stripRef = useRef<HTMLDivElement>(null);
  useEdgeAutoScroll(stripRef);
  const bulk = bulkModeSignal.value;
  const selection = selectionSignal.value;
  const pinned = pinnedSignal.value;
  const count = selection.size;

  if (!bulk) {
    return (
      <div ref={stripRef} class="list-header" role="toolbar" aria-label="Session list header">
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
      ref={stripRef}
      class={cx("list-header", "list-header-bulk")}
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span class="list-header-label">{count} selected</span>
      <Button
        variant="ghost"
        class="bulk-btn"
        iconName={pinIcon}
        disabled={count === 0}
        onClick={() => count > 0 && sendBulkPinSessions(ids(), !allPinned)}
      >
        {pinLabel}
      </Button>
      <Button
        variant="ghost"
        class="bulk-btn"
        iconName="download"
        disabled={count === 0}
        onClick={() => count > 0 && sendBulkExportSessions(ids())}
      >
        Export
      </Button>
      <Button
        variant="ghost"
        class="bulk-btn bulk-btn--danger"
        iconName="trash-2"
        disabled={count === 0}
        onClick={() => count > 0 && sendBulkDeleteSessions(ids())}
      >
        Delete
      </Button>
      <Button
        variant="ghost"
        class="bulk-btn"
        iconName="x"
        title="Exit bulk mode"
        onClick={() => clearSelection()}
      >
        Cancel
      </Button>
    </div>
  );
}
