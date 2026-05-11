/**
 * Skeleton loader markup for tab panels. Painted into a tab container
 * the moment it mounts so users see a placeholder list shape instead of
 * an empty panel or a spinning ring while the host parses data. The
 * feature's mount() overwrites innerHTML with the real shell on first
 * data arrival, so no cleanup is needed.
 *
 * Why skeleton over spinner: perceived performance is higher when the
 * loading state mirrors the post-load layout. The shimmer also reads
 * as activity without the dizzy "spin-forever" feel of a ring.
 */

/** Number of placeholder rows rendered. Six fits a 200-300px sidebar
 *  without scrolling and is enough to read as a list, not a hiccup. */
const SKELETON_ROW_COUNT = 6;

/**
 * Returns markup for a skeleton list loader. The `label` is exposed to
 * assistive tech via `aria-label` on the status region; the visible
 * placeholder rows are hidden from screen readers (`aria-hidden`) to
 * avoid noise.
 */
export function skeletonListHtml(label: string): string {
  const rows = Array.from({ length: SKELETON_ROW_COUNT }, () =>
    `<div class="skeleton-row"><div class="skeleton-bar skeleton-bar-title"></div><div class="skeleton-bar skeleton-bar-sub"></div></div>`,
  ).join("");
  return `<div class="panel-loader" role="status" aria-busy="true" aria-label="${label}"><div class="skeleton-list" aria-hidden="true">${rows}</div></div>`;
}
