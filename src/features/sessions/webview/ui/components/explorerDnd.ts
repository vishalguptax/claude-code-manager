/**
 * Drag and drop of sessions inside the explorer.
 *
 * A drag carries session ids as JSON under a private type, so a drop target
 * can tell an explorer drag from text or files dragged in from elsewhere —
 * and ignore those. Targets are folders (file into), Sessions (take out of
 * any folder), Pinned (pin) and Archived (archive); see `dropOnLocation`.
 */
import { useState } from "preact/hooks";

/** The dataTransfer type an explorer drag carries. */
export const SESSION_IDS_MIME = "application/x-claude-session-ids";

/** Put session ids on a drag, with a "3 sessions" label as the drag image. */
export function startSessionDrag(e: DragEvent, ids: string[]): void {
  const dt = e.dataTransfer;
  if (!dt || ids.length === 0) {
    e.preventDefault();
    return;
  }
  dt.setData(SESSION_IDS_MIME, JSON.stringify(ids));
  dt.effectAllowed = "move";
  // A row-sized ghost of one row says nothing about a multi-row drag; a
  // short label says exactly what is moving. The element only has to exist
  // while the browser snapshots it, so it is removed on the next frame.
  const label = document.createElement("div");
  label.className = "xp-drag-label";
  label.textContent = ids.length === 1 ? "1 session" : `${ids.length} sessions`;
  document.body.appendChild(label);
  dt.setDragImage?.(label, 12, 12);
  requestAnimationFrame(() => label.remove());
}

/** The ids a drop carries, or null when it is not an explorer drag. */
export function readDroppedIds(dt: DataTransfer | null): string[] | null {
  const raw = dt?.getData(SESSION_IDS_MIME);
  if (!raw) return null;
  try {
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) && ids.length > 0 && ids.every((x) => typeof x === "string")
      ? ids
      : null;
  } catch {
    return null;
  }
}

function isSessionDrag(e: DragEvent): boolean {
  return Boolean(e.dataTransfer?.types.includes(SESSION_IDS_MIME));
}

export interface DropTarget {
  /** True while an explorer drag hovers the target. */
  over: boolean;
  props: {
    onDragOver?: (e: DragEvent) => void;
    onDragLeave?: (e: DragEvent) => void;
    onDrop?: (e: DragEvent) => void;
  };
}

/**
 * Make an element a drop target for explorer drags. Pass null for an element
 * that accepts nothing; it gets no handlers, so the browser refuses the drop.
 */
export function useDropTarget(onDrop: ((ids: string[]) => void) | null): DropTarget {
  const [over, setOver] = useState(false);
  if (!onDrop) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e) => {
        if (!isSessionDrag(e)) return;
        // Without preventDefault the browser refuses the drop.
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      // dragleave also fires when the pointer crosses onto a child (an icon,
      // a label); only a real exit from the target clears the highlight.
      onDragLeave: (e) => {
        const target = e.currentTarget as Node;
        if (!target.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e) => {
        if (!isSessionDrag(e)) return;
        e.preventDefault();
        setOver(false);
        const ids = readDroppedIds(e.dataTransfer);
        if (ids) onDrop(ids);
      },
    },
  };
}
