/**
 * GitHub-style activity heatmap. All date math + intensity scaling lives
 * in the pure `buildHeatmap` model builder (heatmap.ts); this component
 * only maps the resolved cells/labels to DOM.
 *
 * The grid shows a fixed rolling year (52 weeks) regardless of the
 * usage period selector — a stable visual anchor lets the user compare
 * weeks across filter changes without the grid jumping. Cell grid
 * coordinates are data-driven, so they are set via inline `style`
 * (the only CSP-safe way to express per-element grid placement); all
 * appearance comes from `.acct-heat-*` classes in account.css.
 *
 * On mount (and on container resize) the wrapper scrolls to the right
 * edge so today stays visible — the 52-week grid is wider than a
 * narrow sidebar and the browser's default left scroll would hide it.
 */

import { useEffect, useRef } from "preact/hooks";
import { cx } from "../../../../webview/shared/lib";
import type { DailyActivity, DailyTokens } from "../../types";
import { buildHeatmap, type HeatmapCell } from "../heatmap";
import { formatNumber } from "../format";

export interface HeatmapProps {
  daily: DailyActivity[];
  dailyTokens: DailyTokens[];
  lastComputedDate: string;
}

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Build one cell's tooltip text from its resolved state + counts. */
function cellTooltip(cell: HeatmapCell): string {
  const date = new Date(`${cell.date}T00:00:00`);
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (cell.state === "future") return dateLabel;
  if (cell.state === "stale") return `Not yet computed · ${dateLabel}`;
  if (cell.tokens > 0) {
    return `${formatNumber(cell.tokens)} tokens · ${cell.messages} message${
      cell.messages === 1 ? "" : "s"
    } · ${cell.sessions} session${cell.sessions === 1 ? "" : "s"} · ${dateLabel}`;
  }
  if (cell.messages > 0) {
    return `${cell.messages} message${cell.messages === 1 ? "" : "s"} · ${cell.sessions} session${
      cell.sessions === 1 ? "" : "s"
    } · ${dateLabel}`;
  }
  return `No activity · ${dateLabel}`;
}

export function Heatmap({ daily, dailyTokens, lastComputedDate }: HeatmapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  // 52 weeks = 364 days. The builder Mon-aligns whatever start we pass.
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 364);
  const startDate = start.toISOString().slice(0, 10);
  const model = buildHeatmap(today, daily, dailyTokens, { startDate, lastComputedDate });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const scrollToToday = (): void => {
      wrap.scrollLeft = wrap.scrollWidth;
    };
    // Defer one frame so the browser has computed scrollWidth after layout.
    const raf = requestAnimationFrame(scrollToToday);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(scrollToToday);
      ro.observe(wrap);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [model.weeks]);

  return (
    <div class="acct-heatmap-wrap" ref={wrapRef}>
      <div
        class="acct-heatmap"
        style={{ gridTemplateColumns: `auto repeat(${model.weeks}, 16px)` }}
      >
        {model.monthLabels.map((m) => (
          <div
            key={`month-${m.col}`}
            class="acct-heat-month"
            style={{ gridColumn: m.col + 2, gridRow: 1 }}
          >
            {m.label}
          </div>
        ))}
        <div class="acct-heat-day" style={{ gridColumn: 1, gridRow: 2 }}>
          {DAY_ABBR[0]}
        </div>
        <div class="acct-heat-day" style={{ gridColumn: 1, gridRow: 4 }}>
          {DAY_ABBR[2]}
        </div>
        <div class="acct-heat-day" style={{ gridColumn: 1, gridRow: 6 }}>
          {DAY_ABBR[4]}
        </div>
        {model.cells.map((cell) => (
          <div
            key={cell.date}
            class={cx("acct-heat-cell", `lvl-${cell.level}`, `state-${cell.state}`)}
            title={cellTooltip(cell)}
            style={{ gridColumn: cell.col + 2, gridRow: cell.row + 2 }}
          />
        ))}
      </div>
    </div>
  );
}
