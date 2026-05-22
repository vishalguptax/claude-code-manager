/**
 * Pure heatmap model builder. Splits date math + intensity scaling
 * out of the renderer so both can be tested in isolation, and so the
 * renderer just walks a fully-resolved structure.
 *
 * The grid is column-major weeks: each column is one Mon..Sun week,
 * and the rightmost column is always the current week. Today lands
 * at row = todayDow within that last column; the rows below today
 * (Sun, etc., depending on weekday) render as `future` cells so the
 * visual end of the heatmap matches the calendar.
 */

import type { DailyActivity, DailyTokens } from "../../types";

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;
export type HeatmapState = "past" | "today" | "future" | "stale";
export type HeatmapScale = "tokens" | "messages" | "none";

export interface HeatmapCell {
  /** ISO YYYY-MM-DD */
  date: string;
  /** 0..weeks-1 (left → right) */
  col: number;
  /** 0..6, Mon=0..Sun=6 */
  row: number;
  level: HeatmapLevel;
  state: HeatmapState;
  tokens: number;
  messages: number;
  sessions: number;
}

export interface HeatmapMonthLabel {
  col: number;
  /** Short month name; suffixed with `'YY` when the year differs from `today`. */
  label: string;
}

export interface HeatmapModel {
  weeks: number;
  cells: HeatmapCell[];
  monthLabels: HeatmapMonthLabel[];
  /** Max value used to scale intensity — 0 when no activity recorded. */
  max: number;
  /** Which signal drives intensity. `"none"` when neither has data. */
  scale: HeatmapScale;
  /** First past/today/stale cell's date (window start). Empty when no cells. */
  rangeStart: string;
  /** Last past/today cell's date (today). Empty when no cells. */
  rangeEnd: string;
}

export interface BuildHeatmapOptions {
  /**
   * Earliest date the heatmap should include (YYYY-MM-DD). The grid
   * widens to fully contain `[startDate, today]` aligned to whole
   * weeks (Mon..Sun). When omitted, the grid only shows the current
   * week.
   */
  startDate?: string;
  /**
   * Most recent date covered by the source cache (YYYY-MM-DD). Cells
   * AFTER this date but still <= today are tagged `stale` so the
   * renderer can mark them as "data not yet computed" instead of
   * misleading the user with an empty cell. Claude CLI rebuilds
   * stats-cache.json on its own cadence (typically 1–2 days behind),
   * so this lag is normal and worth surfacing.
   */
  lastComputedDate?: string;
}

const MS_PER_DAY = 86_400_000;
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Mon=0..Sun=6 (JS getDay() returns Sun=0..Sat=6). */
function mondayDow(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** YYYY-MM-DD in local time — matches the keys stats-cache.json uses. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Add `n` calendar days. Uses setDate so DST transitions don't shift the date. */
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function buildHeatmap(
  today: Date,
  daily: DailyActivity[],
  dailyTokens: DailyTokens[],
  options: BuildHeatmapOptions = {},
): HeatmapModel {
  const todayMid = startOfDay(today);
  const todayDow = mondayDow(todayMid);
  const lastComputedMs = options.lastComputedDate
    ? Date.parse(options.lastComputedDate + "T00:00:00")
    : Number.NaN;

  // End of grid = Sunday of the current week. Last column always
  // contains today; cells past today within that column are `future`.
  const end = addDays(todayMid, 6 - todayDow);

  // Start of grid = Monday on/before the requested startDate. When no
  // startDate was supplied, fall back to the Monday of the current
  // week — the smallest meaningful heatmap (one column).
  const startSeed = options.startDate
    ? new Date(options.startDate + "T00:00:00")
    : addDays(todayMid, -todayDow);
  const seedDow = mondayDow(startSeed);
  const start = addDays(startSeed, -seedDow);

  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  const weeks = Math.max(1, Math.ceil(totalDays / 7));

  const byDate = new Map<string, DailyActivity>();
  for (const d of daily) byDate.set(d.date, d);
  const tokensByDate = new Map<string, number>();
  for (const d of dailyTokens) tokensByDate.set(d.date, d.total);

  // Pick the intensity signal. Tokens beat messages — they reflect
  // actual work, not chat-noise. Fall back to messages when no token
  // data was recorded (older sessions predating usage tracking).
  let max = 0;
  let scale: HeatmapScale = "none";
  for (const total of tokensByDate.values()) {
    if (total > 0) {
      scale = "tokens";
      if (total > max) max = total;
    }
  }
  if (scale === "none") {
    for (const entry of byDate.values()) {
      if (entry.messageCount > 0) {
        scale = "messages";
        if (entry.messageCount > max) max = entry.messageCount;
      }
    }
  }

  const cells: HeatmapCell[] = [];
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const cellDate = addDays(start, col * 7 + row);
      const key = toIsoDate(cellDate);
      const entry = byDate.get(key);
      const tokens = tokensByDate.get(key) ?? 0;
      const messages = entry?.messageCount ?? 0;
      const sessions = entry?.sessionCount ?? 0;

      let state: HeatmapState;
      const cellMs = cellDate.getTime();
      if (cellMs > todayMid.getTime()) {
        state = "future";
      } else if (cellMs === todayMid.getTime()) {
        state = "today";
      } else if (
        !Number.isNaN(lastComputedMs) &&
        cellMs > lastComputedMs &&
        !entry &&
        tokens === 0
      ) {
        // Past day, but the cache hasn't computed it yet AND no
        // activity is recorded — render as "stale" so the user knows
        // it's not blank because they were idle, it's blank because
        // Claude hasn't aggregated it yet.
        state = "stale";
      } else {
        state = "past";
      }

      const intensity = scale === "tokens" ? tokens : scale === "messages" ? messages : 0;
      const level: HeatmapLevel =
        state === "future" || state === "stale" || max === 0 || intensity === 0
          ? 0
          : (Math.min(4, Math.ceil((intensity / max) * 4)) as HeatmapLevel);

      cells.push({ date: key, col, row, level, state, tokens, messages, sessions });
    }
  }

  // Month labels — first column where each month appears. Year suffix
  // (`'YY`) only when the column's year differs from today's, so a
  // typical 12-week view stays clean and a January-spanning view
  // disambiguates which year we're looking at.
  const monthLabels: HeatmapMonthLabel[] = [];
  const todayYear = todayMid.getFullYear();
  let lastMonth = -1;
  for (let col = 0; col < weeks; col++) {
    const weekStart = addDays(start, col * 7);
    const m = weekStart.getMonth();
    if (m === lastMonth) continue;
    const y = weekStart.getFullYear();
    const label =
      y === todayYear
        ? MONTH_ABBR[m]
        : `${MONTH_ABBR[m]} '${String(y).slice(-2)}`;
    monthLabels.push({ col, label });
    lastMonth = m;
  }

  return {
    weeks,
    cells,
    monthLabels,
    max,
    scale,
    rangeStart: toIsoDate(start),
    rangeEnd: toIsoDate(todayMid),
  };
}

export type Period = "week" | "month" | "all";

/**
 * Cutoff in days for a period selector. Single source of truth — the
 * stat-aggregation filter and the heatmap window both derive from
 * this so they always agree on what "the last 7 days" means. The
 * numbers come from the period button labels in the UI ("7 days",
 * "30 days") — they ARE the period, not magic constants.
 */
export function cutoffDaysForPeriod(period: Period): number {
  if (period === "week") return 7;
  if (period === "month") return 30;
  return Infinity;
}

