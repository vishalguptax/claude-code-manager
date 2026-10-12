/**
 * The explorer's content pane, in its two layouts:
 *
 *   Details  one row per item, in sortable columns
 *   Tiles    a grid of cards, as many per row as the pane fits
 *
 * Both are one keyboard-driven listbox (arrow keys, Shift to extend, Enter
 * to open, F2, Delete, Ctrl/Cmd+A, Escape — see `handleExplorerKey`) over a
 * virtualized list, so thousands of sessions cost what a screenful does.
 * Items behave identically in both: click selects, Cmd/Ctrl-click toggles,
 * Shift-click extends, double-click opens, sessions drag, folders accept
 * drops, right-click opens a menu for what is selected.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { Icon, VirtualList } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import { now } from "../../../../../webview/shared/model";
import { fmtRelativeTime } from "../../../../../webview/utils";
import { type ExplorerItem, type SortKey, chunk, sessionTitle } from "../../lib";
import {
  clearExplorerSelection,
  clickItem,
  contextSelect,
  dragSessionIds,
  dropOnLocation,
  effectiveLocationSignal,
  explorerFocusSignal,
  explorerItemsSignal,
  explorerSelectionSignal,
  explorerSortSignal,
  explorerViewModeSignal,
  handleExplorerKey,
  openItem,
  searchQuerySignal,
} from "../../model";
import { startSessionDrag, useDropTarget } from "./explorerDnd";

/** Where a context menu was asked for: on an item, or on empty space. */
export type MenuRequest = { x: number; y: number; item: ExplorerItem | null };

/** Smallest tile width; the grid fits as many of these per row as it can. */
const TILE_MIN_WIDTH = 220;
/** Gap between tiles, and the row's side padding — mirrored in explorer.css. */
const TILE_GAP = 8;
const TILE_PAD = 14;

/** How many tiles fit across a pane `width` pixels wide. */
export function tileColumns(width: number): number {
  return Math.max(1, Math.floor((width - 2 * TILE_PAD + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)));
}

/** A stable DOM id for an item, for `aria-activedescendant`. */
function optionId(index: number): string {
  return `xp-option-${index}`;
}

/** Click, drag and drop wiring shared by a row and a tile. */
function useItemBehaviour(item: ExplorerItem, onMenu: (req: MenuRequest) => void) {
  const drop = useDropTarget(
    item.kind === "folder" ? (ids) => dropOnLocation({ kind: "folder", name: item.name }, ids) : null,
  );
  return {
    over: drop.over,
    props: {
      ...drop.props,
      draggable: item.kind === "session",
      onDragStart: (e: DragEvent) => startSessionDrag(e, dragSessionIds(item.key)),
      onClick: (e: MouseEvent) => {
        // The listbox clears the selection on a click that lands on no item;
        // this one did, so it must not reach the listbox as well.
        e.stopPropagation();
        clickItem(item.key, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey });
      },
      onDblClick: () => openItem(item),
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        contextSelect(item.key);
        onMenu({ x: e.clientX, y: e.clientY, item });
      },
    },
  };
}

function ItemIcon({ item }: { item: ExplorerItem }) {
  if (item.kind === "folder") return <Icon name="folder" size={16} />;
  if (item.session.isLive) {
    return <i class="live-dot" data-status={item.session.status || undefined} />;
  }
  return <Icon name="message-square" size={16} />;
}

function modifiedOf(item: ExplorerItem): number {
  return item.kind === "folder" ? item.modified : item.session.endTime;
}

/** "3 sessions" for a folder, "24 msgs" for a session. */
function sizeOf(item: ExplorerItem): string {
  if (item.kind === "folder") return `${item.count} session${item.count === 1 ? "" : "s"}`;
  return `${item.session.messageCount} msgs`;
}

interface ItemProps {
  item: ExplorerItem;
  index: number;
  selected: boolean;
  focused: boolean;
  onMenu: (req: MenuRequest) => void;
}

// ── Details ──

/**
 * The folder column earns its width only where a list spans folders: the
 * cross-cutting views, and a search from home, which reaches into every
 * folder.
 */
function showsFolderColumn(): boolean {
  const kind = effectiveLocationSignal.value.kind;
  if (kind === "home") return searchQuerySignal.value !== "";
  return kind !== "folder";
}

function DetailsRow({ item, index, selected, focused, onMenu, folderColumn }: ItemProps & { folderColumn: boolean }) {
  const b = useItemBehaviour(item, onMenu);
  const title = item.kind === "folder" ? item.name : sessionTitle(item.session);
  const modified = modifiedOf(item);
  return (
    <div
      id={optionId(index)}
      role="option"
      aria-selected={selected}
      class={cx("xp-row", item.kind, {
        selected,
        focused,
        "is-drop": b.over,
        "has-folder-col": folderColumn,
      })}
      {...b.props}
    >
      <span class="xp-cell xp-cell-name" title={title}>
        <ItemIcon item={item} />
        <span class="xp-name">{title}</span>
      </span>
      {folderColumn ? (
        <span class="xp-cell xp-cell-dim">{item.kind === "session" ? item.folder ?? "" : ""}</span>
      ) : null}
      <span class="xp-cell xp-cell-dim">{item.kind === "session" ? item.session.project : ""}</span>
      <span class="xp-cell xp-cell-dim" title={modified ? new Date(modified).toLocaleString() : ""}>
        {modified ? fmtRelativeTime(modified, now.value) : "—"}
      </span>
      <span class="xp-cell xp-cell-num">{sizeOf(item)}</span>
    </div>
  );
}

const COLUMNS: { key: SortKey | null; label: string; folderOnly?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: null, label: "Folder", folderOnly: true },
  { key: "project", label: "Project" },
  { key: "modified", label: "Modified" },
  { key: "messages", label: "Size" },
];

function DetailsHeader({ folderColumn }: { folderColumn: boolean }) {
  const sort = explorerSortSignal.value;
  return (
    <div class={cx("xp-head", { "has-folder-col": folderColumn })} role="presentation">
      {COLUMNS.filter((c) => folderColumn || !c.folderOnly).map((c) =>
        c.key ? (
          <button
            key={c.label}
            type="button"
            class={cx("xp-head-cell", { sorted: sort.key === c.key })}
            aria-label={`Sort by ${c.label}`}
            onClick={() => {
              const key = c.key as SortKey;
              // Same column flips the direction; a new one starts where people
              // expect — names A–Z, dates and sizes biggest first.
              explorerSortSignal.value =
                sort.key === key
                  ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
                  : { key, dir: key === "name" || key === "project" ? "asc" : "desc" };
            }}
          >
            {c.label}
            {sort.key === c.key ? (
              <span class={cx("xp-sort-arrow", { asc: sort.dir === "asc" })} aria-hidden="true">
                <Icon name="chevron-down" size={12} />
              </span>
            ) : null}
          </button>
        ) : (
          <span key={c.label} class="xp-head-cell">
            {c.label}
          </span>
        ),
      )}
    </div>
  );
}

// ── Tiles ──

function Tile({ item, index, selected, focused, onMenu }: ItemProps) {
  const b = useItemBehaviour(item, onMenu);
  const title = item.kind === "folder" ? item.name : sessionTitle(item.session);
  const modified = modifiedOf(item);
  const branch =
    item.kind === "session" && item.session.branch && item.session.branch !== "HEAD"
      ? item.session.branch
      : "";
  return (
    <div
      id={optionId(index)}
      role="option"
      aria-selected={selected}
      class={cx("xp-tile", item.kind, { selected, focused, "is-drop": b.over })}
      title={title}
      {...b.props}
    >
      <span class="xp-tile-icon">
        <ItemIcon item={item} />
      </span>
      <span class="xp-tile-body">
        <span class="xp-tile-name">{title}</span>
        <span class="xp-tile-meta">
          {item.kind === "session" ? item.session.project : sizeOf(item)}
          {branch ? ` · ${branch}` : ""}
        </span>
        <span class="xp-tile-meta">
          {modified ? fmtRelativeTime(modified, now.value) : "Empty"}
          {item.kind === "session" ? ` · ${sizeOf(item)}` : ""}
        </span>
      </span>
    </div>
  );
}

/** The content pane's width, tracked so the grid can reflow on resize. */
function useWidth(): [preact.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ── The pane ──

export interface ExplorerItemsProps {
  onMenu: (req: MenuRequest) => void;
}

export function ExplorerItems({ onMenu }: ExplorerItemsProps) {
  const [ref, width] = useWidth();
  const items = explorerItemsSignal.value;
  const selection = explorerSelectionSignal.value;
  const focusKey = explorerFocusSignal.value;
  const tiles = explorerViewModeSignal.value === "tiles";
  const columns = tiles ? tileColumns(width) : 1;
  const focusIndex = focusKey === null ? -1 : items.findIndex((i) => i.key === focusKey);
  const folderColumn = showsFolderColumn();

  const interactive = {
    role: "listbox" as const,
    multiselectable: true,
    activeDescendant: focusIndex >= 0 ? optionId(focusIndex) : undefined,
    onKeyDown: (e: KeyboardEvent) => {
      if (handleExplorerKey(e, columns)) e.preventDefault();
    },
    // A click on no item — the gaps between tiles, the space below the last
    // row — clears the selection, as in a file manager.
    onClick: () => clearExplorerSelection(),
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      onMenu({ x: e.clientX, y: e.clientY, item: null });
    },
  };

  const itemProps = (item: ExplorerItem, index: number): ItemProps => ({
    item,
    index,
    selected: selection.has(item.key),
    focused: item.key === focusKey,
    onMenu,
  });

  return (
    <div ref={ref} class={cx("xp-items", tiles ? "tiles" : "details")}>
      {tiles ? (
        <VirtualList
          label="Sessions"
          class="xp-list"
          items={chunk(
            items.map((item, index) => ({ item, index })),
            columns,
          )}
          itemHeight={84}
          scrollToIndex={focusIndex >= 0 ? Math.floor(focusIndex / columns) : undefined}
          interactive={interactive}
          renderItem={(row) => (
            <div class="xp-tile-row" role="presentation">
              {row.map(({ item, index }) => (
                <Tile key={item.key} {...itemProps(item, index)} />
              ))}
              {Array.from({ length: columns - row.length }, (_, i) => (
                <span key={`spacer-${i}`} class="xp-tile-spacer" aria-hidden="true" />
              ))}
            </div>
          )}
        />
      ) : (
        <>
          <DetailsHeader folderColumn={folderColumn} />
          <VirtualList
            label="Sessions"
            class="xp-list"
            items={items}
            itemHeight={30}
            scrollToIndex={focusIndex >= 0 ? focusIndex : undefined}
            interactive={interactive}
            renderItem={(item, index) => (
              <DetailsRow key={item.key} {...itemProps(item, index)} folderColumn={folderColumn} />
            )}
          />
        </>
      )}
    </div>
  );
}
