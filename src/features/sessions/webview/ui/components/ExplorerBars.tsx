/**
 * The explorer's bars: the top bar (back, up, search), the command bar (what
 * can be done to the selection, and how the pane is laid out), and the status
 * bar (where you are, how many items, how many selected).
 *
 * The path lives in the status bar, as Finder's path bar does, rather than in
 * a Windows-style address box: a location is at most "Sessions › folder" and
 * cannot be typed, so an address box was a wide, mostly empty control taking
 * the width search needs.
 */
import {
  Button,
  Dropdown,
  type DropdownOption,
  SearchInput,
  Segmented,
  type SegmentedOption,
} from "../../../../../webview/shared/ui";
import { sendCreateFolder } from "../../api";
import { HOME, type SortKey, locationLabel } from "../../lib";
import {
  type ExplorerViewMode,
  applySearchQuery,
  deleteSelection,
  effectiveLocationSignal,
  explorerHistorySignal,
  explorerItemsSignal,
  explorerPreviewOpenSignal,
  explorerProjectOptionsSignal,
  explorerProjectSignal,
  explorerSortSignal,
  explorerViewModeSignal,
  exportSelection,
  focusedItemSignal,
  goBack,
  goUp,
  moveSelection,
  navigate,
  pinnedSignal,
  renameFocused,
  searchPendingSignal,
  searchQuerySignal,
  selectedItemsSignal,
  selectedSessionIdsSignal,
  toggleArchiveSelection,
  togglePinSelection,
} from "../../model";

/** Matches the sidebar's search box, so both feel the same while typing. */
const SEARCH_DEBOUNCE_MS = 250;

export function ExplorerTopBar() {
  const loc = effectiveLocationSignal.value;
  return (
    <div class="xp-top">
      <Button
        variant="icon"
        iconName="arrow-left"
        title="Back (Alt+Left)"
        ariaLabel="Back"
        disabled={explorerHistorySignal.value.length === 0}
        onClick={goBack}
      />
      <Button
        variant="icon"
        iconName="corner-left-up"
        title="Up to Sessions (Alt+Up)"
        ariaLabel="Up"
        disabled={loc.kind === "home"}
        onClick={goUp}
      />
      <div class="xp-search">
        <SearchInput
          value={searchQuerySignal.value}
          onInput={applySearchQuery}
          debounceMs={SEARCH_DEBOUNCE_MS}
          placeholder={`Search ${locationLabel(loc)}`}
          ariaLabel="Search sessions"
        />
      </div>
    </div>
  );
}

const VIEW_OPTIONS: SegmentedOption<ExplorerViewMode>[] = [
  { value: "details", label: "Details", title: "One row per item, in columns" },
  { value: "tiles", label: "Tiles", title: "A grid of tiles" },
];

const SORT_OPTIONS: DropdownOption[] = [
  { value: "modified:desc", label: "Newest first" },
  { value: "modified:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "project:asc", label: "Project" },
  { value: "messages:desc", label: "Most messages" },
];

export function ExplorerCommandBar() {
  const ids = selectedSessionIdsSignal.value;
  const selected = selectedItemsSignal.value;
  const hasSessions = ids.length > 0;
  const pinned = pinnedSignal.value;
  const allPinned = hasSessions && ids.every((id) => pinned.has(id));
  const inArchive = effectiveLocationSignal.value.kind === "archived";
  const sort = explorerSortSignal.value;
  const projectOptions: DropdownOption[] = explorerProjectOptionsSignal.value.map((o) => ({
    value: o.value,
    label: o.label,
    badge: o.count,
    marker: o.isCurrent ? "current" : undefined,
  }));

  return (
    <div class="xp-commands" role="toolbar" aria-label="Commands">
      <Button variant="ghost" iconName="plus" onClick={() => sendCreateFolder()}>
        New folder
      </Button>
      <span class="xp-commands-sep" aria-hidden="true" />
      <Button
        variant="ghost"
        iconName="folder"
        disabled={!hasSessions}
        title="Move the selected sessions to a folder"
        onClick={moveSelection}
      >
        Move to…
      </Button>
      <Button
        variant="ghost"
        iconName={allPinned ? "pin-off" : "pin"}
        disabled={!hasSessions}
        onClick={togglePinSelection}
      >
        {allPinned ? "Unpin" : "Pin"}
      </Button>
      <Button
        variant="ghost"
        iconName={inArchive ? "archive-restore" : "archive"}
        disabled={!hasSessions}
        onClick={toggleArchiveSelection}
      >
        {inArchive ? "Restore" : "Archive"}
      </Button>
      <Button variant="ghost" iconName="download" disabled={!hasSessions} onClick={exportSelection}>
        Export
      </Button>
      <Button
        variant="ghost"
        iconName="pencil"
        title="Rename (F2)"
        disabled={selected.length !== 1 || focusedItemSignal.value === null}
        onClick={renameFocused}
      >
        Rename
      </Button>
      <Button
        variant="ghost"
        iconName="trash-2"
        title="Delete (Del)"
        disabled={selected.length === 0}
        onClick={deleteSelection}
      >
        Delete
      </Button>

      <div class="xp-commands-end">
        <Dropdown
          ariaLabel="Filter by project"
          value={explorerProjectSignal.value}
          options={projectOptions}
          onChange={(v) => {
            explorerProjectSignal.value = v;
          }}
        />
        <Dropdown
          ariaLabel="Sort"
          icon="chevrons-up-down"
          value={`${sort.key}:${sort.dir}`}
          options={SORT_OPTIONS}
          onChange={(v) => {
            const [key, dir] = v.split(":") as [SortKey, "asc" | "desc"];
            explorerSortSignal.value = { key, dir };
          }}
        />
        <Segmented<ExplorerViewMode>
          size="sm"
          ariaLabel="Layout"
          value={explorerViewModeSignal.value}
          options={VIEW_OPTIONS}
          onChange={(v) => {
            explorerViewModeSignal.value = v;
          }}
        />
        <Button
          variant="icon"
          iconName="panel-right"
          title="Preview pane"
          ariaLabel="Preview pane"
          pressed={explorerPreviewOpenSignal.value}
          onClick={() => {
            explorerPreviewOpenSignal.value = !explorerPreviewOpenSignal.value;
          }}
        />
      </div>
    </div>
  );
}

export function ExplorerStatusBar() {
  const loc = effectiveLocationSignal.value;
  const total = explorerItemsSignal.value.length;
  const selected = selectedItemsSignal.value.length;
  const searching = searchQuerySignal.value !== "";
  return (
    <footer class="xp-status">
      <nav class="xp-crumbs" aria-label="Location">
        {loc.kind === "home" ? (
          <span class="xp-crumb current" aria-current="page">
            Sessions
          </span>
        ) : (
          <>
            <button type="button" class="xp-crumb" onClick={() => navigate(HOME)}>
              Sessions
            </button>
            <span class="xp-crumb-sep" aria-hidden="true">
              ›
            </span>
            <span class="xp-crumb current" aria-current="page">
              {locationLabel(loc)}
            </span>
          </>
        )}
      </nav>
      {/* Only the counts are a live region: announcing the path's buttons on
          every change would be noise. */}
      <span class="xp-status-counts" role="status">
        <span>
          {total} item{total === 1 ? "" : "s"}
        </span>
        {selected > 0 ? <span>{selected} selected</span> : null}
        {searching && searchPendingSignal.value ? <span>Searching transcripts…</span> : null}
      </span>
    </footer>
  );
}
