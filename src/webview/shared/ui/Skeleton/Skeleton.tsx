/**
 * Skeleton atoms — composable shimmer placeholders shown while a view's data
 * loads, restoring the v1 loading affordance the bare "Loading…" text
 * regressed. Feature-specific loading states build their own content-shaped
 * skeletons from these primitives so the swap to real data has minimal layout
 * shift.
 *
 * The chrome is the `.skeleton-*` CSS in base.css: a left→right low-alpha sweep
 * over recessed bars (one shared `skeleton-shimmer` keyframe), with a
 * `prefers-reduced-motion` fallback that drops the sweep but keeps the static
 * structure. Colour is `--vscode-*`-driven only (via `--bg-hover` and a
 * theme-neutral low-alpha white), so it reads on dark / light / high-contrast.
 *
 * Appearance (colour, radius default, shimmer) lives in CSS. Only the
 * data-driven dimensions (width / height / size) are inline styles — the same
 * pattern QuotaBar uses for its width-from-utilization fill — because there is
 * no static class equivalent for an arbitrary placeholder size.
 *
 * Atoms:
 *   - <SkeletonLine />   a text-line bar (default width 100%, height 10px).
 *   - <SkeletonBlock />  a rectangle (alias <SkeletonRect />) for inputs,
 *                        buttons, badges, bars, cards — any boxy placeholder.
 *   - <SkeletonCircle /> a round avatar placeholder.
 *   - <Skeleton />       legacy one-row convenience (title + optional sub bar).
 *   - <SkeletonList />   N rows wrapped in `.skeleton-list`, the generic
 *                        fallback for a list/content loading branch.
 */

/** Map a numeric prop to a px string; pass strings (e.g. "60%") through. */
function dim(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export interface SkeletonLineProps {
  /** Bar width — number (px) or any CSS length/percentage (default "100%"). */
  width?: number | string;
  /** Bar height in px (default 10). */
  height?: number;
}

/** A single text-line placeholder bar. */
export function SkeletonLine({ width = "100%", height = 10 }: SkeletonLineProps) {
  return (
    <div
      class="skeleton-el skeleton-line"
      aria-hidden="true"
      style={{ width: dim(width), height: dim(height) }}
    />
  );
}

export interface SkeletonBlockProps {
  /** Block width — number (px) or any CSS length/percentage (default "100%"). */
  width?: number | string;
  /** Block height — number (px) or any CSS length (default 32, the control height). */
  height?: number | string;
  /** Corner radius in px. Omit to use the default `--radius` from CSS. */
  radius?: number;
}

/**
 * A rectangular placeholder — inputs, buttons, badges, bars, cards. The boxy
 * counterpart to <SkeletonLine />.
 */
export function SkeletonBlock({ width = "100%", height = 32, radius }: SkeletonBlockProps) {
  return (
    <div
      class="skeleton-el skeleton-block"
      aria-hidden="true"
      style={{ width: dim(width), height: dim(height), borderRadius: dim(radius) }}
    />
  );
}

/** Alias for <SkeletonBlock /> — reads clearer where a rectangle is meant. */
export const SkeletonRect = SkeletonBlock;

export interface SkeletonCircleProps {
  /** Diameter in px (default 40, the account avatar size). */
  size?: number;
}

/** A round placeholder — avatars, status dots. */
export function SkeletonCircle({ size = 40 }: SkeletonCircleProps) {
  return (
    <div
      class="skeleton-el skeleton-circle"
      aria-hidden="true"
      style={{ width: dim(size), height: dim(size) }}
    />
  );
}

export interface SkeletonProps {
  /** Render the shorter secondary bar under the title (default true). */
  sub?: boolean;
}

/** Legacy one-row convenience — a title line and an optional sub line. */
export function Skeleton({ sub = true }: SkeletonProps) {
  return (
    <div class="skeleton-row" aria-hidden="true">
      <SkeletonLine width="70%" />
      {sub ? <SkeletonLine width="40%" height={8} /> : null}
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
 * A panel of generic placeholder rows. The neutral fallback used by the shared
 * <Loading /> for the TabPanel lazy-import phase; per-feature data-loading
 * gates use their own content-shaped skeleton instead.
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
