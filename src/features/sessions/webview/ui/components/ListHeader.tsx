/**
 * The strip above the session list. At rest it shows the session count, a
 * collapse/expand-all toggle, and a "Select" toggle; in bulk mode it becomes a
 * toolbar with pin/unpin, export, delete, and cancel actions scoped to the
 * current selection.
 */
import { useRef } from "preact/hooks";
import { useEdgeAutoScroll } from "../../../../../webview/shared/hooks";
import { Button, Icon } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import { sendBulkDeleteSessions, sendBulkExportSessions, sendBulkPinSessions } from "../../api";
import {
  allGroupsCollapsed,
  bulkModeSignal,
  groupLabelsSignal,
  setGroupsCollapsed,
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
    const labels = groupLabelsSignal.value;
    const allCollapsed = allGroupsCollapsed.value;
    return (
      <div ref={stripRef} class="list-header" role="toolbar" aria-label="Session list header">
        <span class="list-header-label">
          {totalCount} session{totalCount !== 1 ? "s" : ""}
        </span>
        {/* Only offered when there is more than one section: with a single
            section the control does exactly what that section's own header
            already does, one row below. */}
        {/* Icon-only, deliberately. A label that swapped "Collapse" for "Expand"
            resized the button on every press and shoved Select sideways with
            it. The glyph already carries the direction — its chevrons converge
            to fold and diverge to unfold — and this is the form VS Code gives
            the same control in its own tree toolbars. */}
        {labels.length > 1 ? (
          <Button
            variant="icon-outline"
            iconName={allCollapsed ? "chevrons-up-down" : "chevrons-down-up"}
            title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
            ariaLabel={allCollapsed ? "Expand all sections" : "Collapse all sections"}
            onClick={() => setGroupsCollapsed(labels, !allCollapsed)}
          />
        ) : null}
        <Button
          variant="outline"
          iconName="check"
          title="Enter bulk-select mode"
          onClick={() => setBulkMode(true)}
        >
          Select
        </Button>
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
