/**
 * The session list: launch actions, filters, the count/bulk header, and a
 * virtualized list of session rows.
 *
 * The list is virtualized (special-consideration B) so 5,000+ sessions scroll
 * in constant time. Rows are a flat, pinned-first, most-recent-first slice of
 * `getFiltered()` — date-group headers from v1 are dropped because a
 * fixed-height virtualizer needs uniform rows; pinned-first ordering is
 * preserved so favourites stay at the top.
 */
import { EmptyState } from "../../../../webview/components/EmptyState";
import { VirtualList } from "../../../../webview/components/VirtualList";
import {
  sendGetSessionDetail,
  sendResumeSession,
} from "../api";
import { ActionsBar } from "../components/ActionsBar";
import { Filters } from "../components/Filters";
import { ListHeader } from "../components/ListHeader";
import { SessionItem } from "../components/SessionItem";
import {
  bulkModeSignal,
  clearFullTextHits,
  detailLoadingSignal,
  getFiltered,
  pinnedSignal,
  searchQuerySignal,
  selectedIdSignal,
  selectionSignal,
  sessionsSignal,
  toggleSelected,
  viewSignal,
} from "../signals";

/** Fixed row height used by the virtualizer; matches the .session-item box. */
const ITEM_HEIGHT = 64;

export function ListView() {
  const filtered = getFiltered();
  const total = filtered.length;
  const pinned = pinnedSignal.value;
  const selectedId = selectedIdSignal.value;
  const selection = selectionSignal.value;
  const bulk = bulkModeSignal.value;
  const query = searchQuerySignal.value;

  const openDetail = (id: string): void => {
    selectedIdSignal.value = id;
    detailLoadingSignal.value = true;
    viewSignal.value = "detail";
    sendGetSessionDetail(id);
  };

  const resume = (id: string): void => {
    const s = sessionsSignal.value.find((x) => x.id === id);
    if (s) sendResumeSession(id, s.entrypoint, s.projectPath);
  };

  const onToggleSelect = (id: string): void => {
    toggleSelected(id);
  };

  return (
    <div class="panel" id="listView">
      <ActionsBar />
      <Filters />
      <ListHeader totalCount={total} />
      {total === 0 ? (
        query ? (
          <EmptyState
            icon="search-slash"
            title="No matching sessions"
            description="Try a different keyword or clear the search to see all sessions."
          >
            <button
              type="button"
              class="btn"
              onClick={() => {
                searchQuerySignal.value = "";
                clearFullTextHits();
                const input = document.getElementById("search") as HTMLInputElement | null;
                if (input) {
                  input.value = "";
                  input.focus();
                }
              }}
            >
              Clear search
            </button>
          </EmptyState>
        ) : (
          <EmptyState
            icon="inbox"
            title="No sessions yet"
            description="Start a new Claude Code session — your history will appear here."
          />
        )
      ) : (
        <VirtualList
          class="list"
          items={filtered}
          itemHeight={ITEM_HEIGHT}
          renderItem={(s) => (
            <SessionItem
              key={s.id}
              session={s}
              isActive={s.id === selectedId}
              isPinned={pinned.has(s.id)}
              isSelected={selection.has(s.id)}
              bulkMode={bulk}
              onSelect={openDetail}
              onResume={resume}
              onToggleSelect={onToggleSelect}
            />
          )}
        />
      )}
    </div>
  );
}
