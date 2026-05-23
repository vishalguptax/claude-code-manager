/**
 * Pure list-shaping helpers for the sessions feature. No JSX, no signal reads —
 * every function takes its inputs explicitly so it stays trivially unit-testable
 * and reusable across the model and ui segments.
 */
import { dateLabel } from "../../../../webview/utils";
import type { Session, SessionGroup } from "../../types";

/**
 * Flatten the host's grouped session payload back into a flat array. The host
 * still groups by date for the legacy contract; the virtualized list wants a
 * single ordered array, so we concat the groups (which already arrive in
 * display order).
 */
export function flattenGroups(data: SessionGroup[]): Session[] {
  const out: Session[] = [];
  for (const g of data) out.push(...g.sessions);
  return out;
}

/** A virtualized row is either a date-group header or a session. */
export type Row =
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
