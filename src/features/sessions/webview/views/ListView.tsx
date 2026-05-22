/**
 * The session list: launch actions, filters, the count/bulk header, a
 * virtualized list of session rows with date-group section headers, and the
 * app footer.
 *
 * The list is virtualized (special-consideration B) so 5,000+ sessions scroll
 * in constant time. Date-group headers (Today / Yesterday / This Week / older)
 * are restored by interleaving header rows into the same flat, fixed-height
 * row array the virtualizer renders — see `buildRows`. Keeping every row a
 * uniform `ITEM_HEIGHT` lets us reuse the shared fixed-height VirtualList
 * untouched (no variable-height rewrite that would ripple into the other
 * features' lists) while preserving pinned-first ordering: pinned sessions are
 * grouped under a "Pinned" header first, then the rest by date label.
 */
import { useEffect, useState } from "preact/hooks";
import { ContextMenu } from "../../../../webview/shared/ui";
import { EmptyState } from "../../../../webview/shared/ui";
import { VirtualList } from "../../../../webview/shared/ui";
import { dateLabel } from "../../../../webview/utils";
import { sendGetSessionDetail, sendResumeSession } from "../api";
import { ActionsBar } from "../components/ActionsBar";
import { Filters } from "../components/Filters";
import { Footer } from "../components/Footer";
import { ListHeader } from "../components/ListHeader";
import { SessionItem } from "../components/SessionItem";
import { buildSessionMenuItems } from "../components/sessionMenu";
import {
  bulkModeSignal,
  clearFullTextHits,
  detailLoadingSignal,
  getFiltered,
  pinnedSignal,
  searchQuerySignal,
  selectAll,
  selectedIdSignal,
  selectionSignal,
  sessionsSignal,
  toggleSelected,
  viewSignal,
} from "../signals";
import type { Session } from "../../types";

/** Fixed row height used by the virtualizer; matches the .session-item box. */
const ITEM_HEIGHT = 64;

/** A virtualized row is either a date-group header or a session. */
type Row =
  | { kind: "header"; label: string }
  | { kind: "session"; session: Session };

/**
 * Flatten the filtered, pinned-first session list into header + session rows.
 * Pinned sessions are collected under a leading "Pinned" group; the remaining
 * sessions are bucketed by their `dateLabel` in their existing (recency) order.
 * Group order follows first appearance, which mirrors the recency sort.
 */
export function buildRows(sessions: Session[], pinned: Set<string>): Row[] {
  const rows: Row[] = [];
  const pinnedRows = sessions.filter((s) => pinned.has(s.id));
  const rest = sessions.filter((s) => !pinned.has(s.id));

  if (pinnedRows.length > 0) {
    rows.push({ kind: "header", label: "Pinned" });
    for (const s of pinnedRows) rows.push({ kind: "session", session: s });
  }

  let currentLabel: string | null = null;
  for (const s of rest) {
    const label = dateLabel(s.endTime);
    if (label !== currentLabel) {
      rows.push({ kind: "header", label });
      currentLabel = label;
    }
    rows.push({ kind: "session", session: s });
  }
  return rows;
}

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
  const [menu, setMenu] = useState<MenuState | null>(null);

  const rows = buildRows(filtered, pinned);

  // Ctrl/Cmd+A selects every visible session while in bulk mode. Scoped to bulk
  // mode so a user typing in the search box still gets native select-all, and
  // ignored when focus is in an input/textarea (verbatim v1 listView guard).
  useEffect(() => {
    if (!bulk) return;
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "a") return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      selectAll(getFiltered().map((s) => s.id));
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
                onSelect={openDetail}
                onResume={resume}
                onToggleSelect={onToggleSelect}
                onContextMenu={openMenu}
              />
            )
          }
        />
      )}
      <Footer />
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={
          menu ? buildSessionMenuItems(menu.sessionId, pinned.has(menu.sessionId)) : []
        }
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
