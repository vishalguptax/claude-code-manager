/**
 * The explorer's preview pane: the focused session's full detail, or a
 * summary of the focused folder, or a count when several items are selected.
 */
import { useEffect } from "preact/hooks";
import { Button, EmptyState } from "../../../../../webview/shared/ui";
import { fmtRelativeTime } from "../../../../../webview/utils";
import { sendGetSessionDetail, sendRenameFolder } from "../../api";
import {
  detailLoadingSignal,
  detailSignal,
  focusedItemSignal,
  openItem,
  selectedIdSignal,
  selectedItemsSignal,
} from "../../model";
import { DetailView } from "../views/DetailView";

/** Load a session into the shared detail signals, unless it is already there. */
function usePreviewSession(id: string | null): void {
  useEffect(() => {
    if (id === null || selectedIdSignal.value === id) return;
    selectedIdSignal.value = id;
    detailSignal.value = null;
    detailLoadingSignal.value = true;
    sendGetSessionDetail(id);
  }, [id]);
}

export function ExplorerPreview() {
  const focused = focusedItemSignal.value;
  const selectedCount = selectedItemsSignal.value.length;
  const sessionId = focused?.kind === "session" ? focused.session.id : null;
  usePreviewSession(selectedCount > 1 ? null : sessionId);

  let body;
  if (selectedCount > 1) {
    body = <EmptyState icon="check" title={`${selectedCount} items selected`} />;
  } else if (focused?.kind === "folder") {
    body = (
      <div class="xp-preview-folder">
        <EmptyState
          icon="folder"
          title={focused.name}
          description={
            focused.count === 0
              ? "Empty. Drag sessions here, or use Move to… on a selection."
              : `${focused.count} session${focused.count === 1 ? "" : "s"} · last active ${fmtRelativeTime(focused.modified)}`
          }
        />
        <div class="xp-preview-actions">
          <Button variant="primary" iconName="folder" onClick={() => openItem(focused)}>
            Open
          </Button>
          <Button iconName="pencil" onClick={() => sendRenameFolder(focused.name)}>
            Rename
          </Button>
        </div>
      </div>
    );
  } else if (sessionId !== null) {
    body = <DetailView context="explorer" />;
  } else {
    body = (
      <EmptyState
        icon="panel-right"
        title="Nothing selected"
        description="Select a session to read it here."
      />
    );
  }

  return (
    <aside class="xp-preview" aria-label="Preview">
      {body}
    </aside>
  );
}
