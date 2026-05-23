/**
 * Skeleton / SkeletonList — animated shimmer placeholders shown while a view's
 * data loads, restoring the v1 loading affordance the bare "Loading…" text
 * regressed. The chrome is the orphaned `.skeleton-*` CSS in base.css (a
 * left→right low-alpha sweep over recessed bars, staggered down the list, with a
 * `prefers-reduced-motion` fallback that drops the sweep but keeps the static
 * structure). Colour is `--vscode-*`-driven only (via `--bg-hover` and a
 * theme-neutral low-alpha white), so it reads on dark / light / high-contrast.
 *
 * Two shapes:
 *   - <Skeleton />      one row: a title bar + an optional shorter sub bar.
 *   - <SkeletonList />  N rows wrapped in `.skeleton-list` inside `.panel-loader`,
 *                       the drop-in for a loading list/content branch.
 */

export interface SkeletonProps {
  /** Render the shorter secondary bar under the title (default true). */
  sub?: boolean;
}

/** One placeholder row — a title bar and an optional sub bar. */
export function Skeleton({ sub = true }: SkeletonProps) {
  return (
    <div class="skeleton-row" aria-hidden="true">
      <div class="skeleton-bar skeleton-bar-title" />
      {sub ? <div class="skeleton-bar skeleton-bar-sub" /> : null}
    </div>
  );
}

export interface SkeletonListProps {
  /** Number of placeholder rows (default 6 — matches the CSS stagger steps). */
  rows?: number;
  /** Render the secondary bar on each row (default true). */
  sub?: boolean;
}

/**
 * A panel of placeholder rows. `rows` defaults to 6, the number of staggered
 * shimmer delays defined in the CSS — more rows still animate, just without the
 * extra per-row delay, which is fine.
 */
export function SkeletonList({ rows = 6, sub = true }: SkeletonListProps) {
  return (
    <div class="panel-loader" aria-busy="true" aria-live="polite">
      <div class="skeleton-list">
        {Array.from({ length: rows }, (_, i) => (
          // Static structural placeholders with no identity of their own and a
          // list that never reorders, so an index key is correct here.
          <Skeleton key={i} sub={sub} />
        ))}
      </div>
    </div>
  );
}
