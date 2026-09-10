/**
 * Pure list-shaping helpers for the sessions feature. No JSX, no signal reads —
 * every function takes its inputs explicitly so it stays trivially unit-testable
 * and reusable across the model and ui segments.
 */
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
  | { kind: "header"; label: string; count: number; collapsed: boolean }
  | { kind: "session"; session: Session };

/** Section labels whose meaning shifts with the calendar. See {@link isVolatileLabel}. */
const ACTIVE_LABEL = "Active";
const TODAY_LABEL = "Today";
const PINNED_LABEL = "Pinned";
const YESTERDAY_LABEL = "Yesterday";

/**
 * True for a section label that means something different tomorrow than it does
 * today. Collapse state for these is deliberately NOT persisted: a stored
 * "Today collapsed" would hide the next day's work behind a preference the user
 * set about different sessions, which is the exact problem the day sections
 * exist to solve. Absolute labels ("Mon, Sep 8", "August 2026") are stable and
 * persist fine.
 */
export function isVolatileLabel(label: string): boolean {
  return label === ACTIVE_LABEL || label === TODAY_LABEL || label === YESTERDAY_LABEL;
}

/** Whole days from `ts`'s local calendar date back to `now`'s. Same day = 0. */
function dayDiff(ts: number, now: number): number {
  const a = new Date(ts);
  const b = new Date(now);
  const dayA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const dayB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  // Divide the difference of two local midnights, so DST shifts (a 23- or
  // 25-hour day) still round to a whole day count.
  return Math.round((dayB - dayA) / 86400000);
}

/** "Sep 8" — month and day, no year. */
function monthDay(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Local midnight `n` days before `ts`. */
function midnightBefore(ts: number, n: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime();
}

/** Last day covered by per-day sections; beyond this, sessions bucket by week. */
const DAY_TIER_DAYS = 7;
/** Last day covered by per-week sections; beyond this, sessions bucket by month. */
const WEEK_TIER_DAYS = 35;

/**
 * Section label for a session's last-activity time, on a three-tier ladder:
 *
 *   Today · Yesterday · "Mon, Sep 8"   (per day, back 7 days)
 *   "Sep 1 – Sep 7"                    (per week, back 5 weeks)
 *   "August 2026"                      (per month, older)
 *
 * The coarsening is deliberate. A per-day section for every active day reads
 * well for the current week — which is what you actually navigate — but a
 * corpus spanning months turns into a wall of headers, most of them holding a
 * single row. Recent days get precision; history gets compactness.
 *
 * `now` is injected rather than read from the clock so the buckets are
 * testable and one render pass can never straddle midnight.
 */
export function sessionDayLabel(ts: number, now: number = Date.now()): string {
  const diff = dayDiff(ts, now);
  if (diff <= 0) return TODAY_LABEL;
  if (diff === 1) return YESTERDAY_LABEL;
  if (diff < DAY_TIER_DAYS) {
    return new Date(ts).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  if (diff < WEEK_TIER_DAYS) {
    // Week buckets are aligned to today, not to the calendar week: the tier
    // starts at DAY_TIER_DAYS, so bucket k spans days [7+7k, 13+7k]. Anchoring
    // to Sunday instead would make the first bucket a 1-to-7-day stub whose
    // length changed with the weekday you happened to open the panel on.
    const k = Math.floor((diff - DAY_TIER_DAYS) / 7);
    const newest = midnightBefore(now, DAY_TIER_DAYS + 7 * k);
    const oldest = midnightBefore(now, DAY_TIER_DAYS + 7 * k + 6);
    return `${monthDay(oldest)} – ${monthDay(newest)}`;
  }
  return new Date(ts).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Flatten the filtered session list into header + session rows.
 *
 * Section order:
 *
 *   Active      live sessions, any pin state
 *   Today       everything from today, pinned or not
 *   Pinned      pinned sessions older than today
 *   Yesterday   …then the day/week/month ladder (see sessionDayLabel)
 *
 * Pinned sits BELOW Today on purpose. It used to sit above, so the moment a
 * session stopped being live it fell out of Active and landed underneath the
 * whole pinned stash — in a narrow sidebar, today's work scrolled off-screen
 * while you were away from the keyboard. Today's work now always wins the slot
 * under Active, and a session pinned *today* stays in Today (it is still
 * today's work; the row keeps its pin badge either way).
 *
 * A collapsed section contributes its header only — the header still reports
 * the true count, so collapsing hides rows without hiding information.
 *
 * A session never appears twice: Active wins over Today, Today over Pinned,
 * Pinned over the date ladder.
 */
export function buildRows(
  sessions: Session[],
  pinned: Set<string>,
  collapsed: Set<string> = new Set(),
  now: number = Date.now(),
): Row[] {
  const active: Session[] = [];
  const today: Session[] = [];
  const pinnedRows: Session[] = [];
  const rest: Session[] = [];
  for (const s of sessions) {
    if (s.isLive) active.push(s);
    else if (sessionDayLabel(s.endTime, now) === TODAY_LABEL) today.push(s);
    else if (pinned.has(s.id)) pinnedRows.push(s);
    else rest.push(s);
  }

  const rows: Row[] = [];
  const section = (label: string, group: Session[]): void => {
    if (group.length === 0) return;
    const isCollapsed = collapsed.has(label);
    rows.push({ kind: "header", label, count: group.length, collapsed: isCollapsed });
    if (isCollapsed) return;
    for (const s of group) rows.push({ kind: "session", session: s });
  };

  section(ACTIVE_LABEL, active);
  section(TODAY_LABEL, today);
  section(PINNED_LABEL, pinnedRows);

  // `rest` arrives newest-first, so labels change monotonically down the
  // ladder — one pass emitting a section per label run keeps them in recency
  // order without an explicit label ordering table.
  let runLabel: string | null = null;
  let run: Session[] = [];
  for (const s of rest) {
    const label = sessionDayLabel(s.endTime, now);
    if (label !== runLabel) {
      if (runLabel !== null) section(runLabel, run);
      runLabel = label;
      run = [];
    }
    run.push(s);
  }
  if (runLabel !== null) section(runLabel, run);

  return rows;
}
