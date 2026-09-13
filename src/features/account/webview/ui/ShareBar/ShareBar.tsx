/**
 * Part-to-whole as one horizontal bar: each model's share of the tokens, in
 * proportion, across the full width of the section.
 *
 * This replaced an 88px donut. The donut was not broken, but it was the wrong
 * encoding for this column:
 *
 *   - The legend beneath already gives every model its name, cost and share,
 *     so the ring was not where anyone read the numbers.
 *   - Comparing lengths is more accurate than comparing angles (Cleveland &
 *     McGill), and comparing shares is the only thing this chart is for.
 *   - It spent 88px of a ~312px content column on a shape carrying one number
 *     per slice, where a bar uses the full width and about 8px of height.
 *   - It degraded badly. A user on Opus 4.5, 4.8 and 5 plus Sonnet and Haiku
 *     gets five thin wedges; a bar just keeps subdividing.
 *
 * Segments below a visible fraction are not dropped — a model that ran at all
 * should appear — but they are floored at a width that stays visible, and the
 * legend carries the true figure either way.
 */

export interface ShareSegment {
  /** Stable key, and the tooltip's subject. */
  key: string;
  /** Human-readable name for the tooltip. */
  label: string;
  value: number;
  color: string;
}

export interface ShareBarProps {
  segments: ShareSegment[];
  /** Describes the whole bar to a screen reader, e.g. "Token share by model". */
  ariaLabel: string;
}

/** Below this many percent a segment would render as a hairline or vanish. */
const MIN_VISIBLE_PCT = 1.5;

export function ShareBar({ segments, ariaLabel }: ShareBarProps) {
  const positive = segments.filter((s) => s.value > 0);
  const total = positive.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const shares = positive.map((s) => ({ ...s, pct: (s.value / total) * 100 }));
  // Floor the slivers, then take the difference back off the largest segment so
  // the widths still sum to 100 and the bar has no gap at its end.
  const lifted = shares.reduce((sum, s) => sum + Math.max(0, MIN_VISIBLE_PCT - s.pct), 0);
  const largest = shares.reduce((a, b) => (b.pct > a.pct ? b : a), shares[0]);

  return (
    <div
      class="acct-share-bar"
      role="img"
      aria-label={`${ariaLabel}: ${shares
        .map((s) => `${s.label} ${Math.round(s.pct)}%`)
        .join(", ")}`}
    >
      {shares.map((s) => {
        const width =
          s.pct < MIN_VISIBLE_PCT
            ? MIN_VISIBLE_PCT
            : s === largest
              ? Math.max(MIN_VISIBLE_PCT, s.pct - lifted)
              : s.pct;
        return (
          <span
            key={s.key}
            class="acct-share-seg"
            style={{ width: `${width}%`, background: s.color }}
            title={`${s.label} · ${Math.round(s.pct)}%`}
          />
        );
      })}
    </div>
  );
}
