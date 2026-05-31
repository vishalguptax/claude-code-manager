/**
 * Tiny SVG donut chart. Built by hand (no dependency) because pulling
 * a charting library for a single 100×100 SVG would inflate every
 * user's bundle for almost no win.
 *
 * Each segment is one `<circle>` using stroke-dasharray to draw the
 * proportion + stroke-dashoffset to position it on the ring. The
 * `transform="rotate(-90 50 50)"` puts segment 0 at the 12-o'clock
 * position so the donut reads clockwise from the top.
 *
 * Accessibility: `aria-hidden="true"` because the donut is paired with
 * a legend list that conveys the same data textually — meeting the
 * `color-not-only` rule without forcing screen readers to parse SVG.
 */

export interface DonutSegment {
  /** Stable key for the segment (model id, etc.). */
  key: string;
  /** Raw value used for the share calculation. */
  value: number;
  /** Stroke colour (CSS colour string or var()). */
  color: string;
}

export interface DonutProps {
  segments: DonutSegment[];
  /** Outer pixel size of the rendered svg. */
  size?: number;
}

const R = 40;
const C = 2 * Math.PI * R; // ≈ 251.327

export function Donut({ segments, size = 88 }: DonutProps) {
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  let cursor = 0;
  return (
    <svg
      class="acct-donut"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle class="acct-donut-track" cx="50" cy="50" r={R} />
      {total > 0
        ? segments.map((s) => {
            const share = Math.max(0, s.value) / total;
            const visible = share * C;
            const offset = -cursor * C;
            cursor += share;
            return (
              <circle
                key={s.key}
                cx="50"
                cy="50"
                r={R}
                stroke={s.color}
                stroke-dasharray={`${visible} ${C - visible}`}
                stroke-dashoffset={offset}
                transform="rotate(-90 50 50)"
                class="acct-donut-arc"
              />
            );
          })
        : null}
    </svg>
  );
}
