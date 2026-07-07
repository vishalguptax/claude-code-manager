/**
 * The session list: launch actions, filters, the count/bulk header, a
 * virtualized list of session rows with date-group section headers, and the
 * app footer.
 *
 * The list is virtualized (special-consideration B) so 5,000+ sessions scroll
 * in constant time. Date-group headers (Today / Yesterday / This Week / older)
 * are restored by interleaving header rows into the same flat, fixed-height
 * row array the virtualizer renders — see `buildRows` (sessions `lib`). Keeping
 * every row a uniform `ITEM_HEIGHT` lets us reuse the shared fixed-height
 * VirtualList untouched (no variable-height rewrite that would ripple into the
 * other features' lists) while preserving pinned-first ordering: pinned
 * sessions are grouped under a "Pinned" header first, then the rest by date
 * label.
 */
import { useEffect, useState } from "preact/hooks";
import { Button, ContextMenu, EmptyState, VirtualList } from "../../../../../webview/shared/ui";
import { buildRows } from "../../lib";
import {
  bulkModeSignal,
  clearFullTextHits,
  clearSelection,
  currentProjectSignal,
  detailLoadingSignal,
  getFiltered,
  openTerminalsSignal,
  tempSessionsSignal,
  pinnedSignal,
  searchQuerySignal,
  selectAll,
  selectedIdSignal,
  selectionSignal,
  sessionsSignal,
  toggleSelected,
  viewSignal,
} from "../../model";
import { sendGetSessionDetail, sendResumeSession, sendViewTerminal } from "../../api";
import { ActionsBar } from "../components/ActionsBar";
import { Filters } from "../components/Filters";
import { ListHeader } from "../components/ListHeader";
import { SessionItem } from "../components/SessionItem";
import { buildSessionMenuItems } from "../components/sessionMenu";

/** Fixed row height used by the virtualizer; matches the .session-item box. */
const ITEM_HEIGHT = 64;

interface MenuState {
  sessionId: string;
  x: number;
  y: number;
}

export function ListView() {
  const filtered = getFiltered();
  const total = filtered.length;
  const pinned = pinnedSignal.value;
  const selectedId = selectedIdSignal.value;
  const selection = selectionSignal.value;
  const bulk = bulkModeSignal.value;
  const query = searchQuerySignal.value;
  const openTerminals = openTerminalsSignal.value;
  const tempSessions = tempSessionsSignal.value;
  const currentProject = currentProjectSignal.value;
  const [menu, setMenu] = useState<MenuState | null>(null);

  const rows = buildRows(filtered, pinned);

  // Bulk-mode keyboard shortcuts, scoped to bulk mode so they're inert
  // otherwise. Ignored when focus is in an input/textarea (verbatim v1 listView
  // guard) so the search field keeps native behaviour:
  //   - Ctrl/Cmd+A selects every visible session (native select-all elsewhere);
  //   - Escape exits bulk mode (clearing the selection) — the same dismiss-on-
  //     Escape gesture every other transient surface uses, applied to this
  //     transient mode for consistency.
  useEffect(() => {
    if (!bulk) return;
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        if (inField) return;
        e.preventDefault();
        selectAll(getFiltered().map((s) => s.id));
      } else if (e.key === "Escape") {
        if (inField) return;
        clearSelection();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bulk]);

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

  const view = (id: string): void => {
    sendViewTerminal(id);
  };

  const onToggleSelect = (id: string): void => {
    toggleSelected(id);
  };

  const openMenu = (id: string, x: number, y: number): void => {
    setMenu({ sessionId: id, x, y });
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
            <Button
              onClick={() => {
                // The search box is controlled by searchQuerySignal, so clearing
                // the signal re-syncs the shared <SearchInput> mirror to empty.
                searchQuerySignal.value = "";
                clearFullTextHits();
              }}
            >
              Clear search
            </Button>
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
          items={rows}
          itemHeight={ITEM_HEIGHT}
          renderItem={(row) =>
            row.kind === "header" ? (
              <div class="group-label" key={`h:${row.label}`}>
                {row.label}
              </div>
            ) : (
              <SessionItem
                key={row.session.id}
                session={row.session}
                isActive={row.session.id === selectedId}
                isPinned={pinned.has(row.session.id)}
                isSelected={selection.has(row.session.id)}
                bulkMode={bulk}
                hasOpenTerminal={openTerminals.has(row.session.id)}
                isTemp={tempSessions.has(row.session.id)}
                isDiffProject={Boolean(currentProject && row.session.projectKey !== currentProject)}
                onSelect={openDetail}
                onResume={resume}
                onView={view}
                onToggleSelect={onToggleSelect}
                onContextMenu={openMenu}
              />
            )
          }
        />
      )}
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={
          menu
            ? buildSessionMenuItems(
                menu.sessionId,
                pinned.has(menu.sessionId),
                tempSessions.has(menu.sessionId),
              )
            : []
        }
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
