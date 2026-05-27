/**
 * Loading skeleton for the sessions list. Mirrors the real ListView shell so
 * the swap to data has no layout shift:
 *   - the `.actions-bar` button row (New / Temp / Continue / Restore / Import);
 *   - the `.search-row` (search field + refresh button);
 *   - the `.filter-row` (project + branch dropdowns) and the date-chip row;
 *   - ~6 session rows, each a title + relative-time line, a prompt line, and a
 *     branch-badge + project meta line, sized to the virtualizer's 64px row.
 *
 * Reuses the same `.actions-bar` / `.search-row` / `.filter-row` / `.date-chips`
 * insets and `--h-control` field height the real controls use, plus the fixed
 * session-row height, so the placeholder occupies the live layout's footprint.
 */

import { SkeletonBlock, SkeletonLine } from "../../../../../webview/shared/ui";

/** Action buttons in the real ActionsBar, by width hint (px). */
const ACTION_WIDTHS = [60, 64, 84, 132, 72];

/** Title / prompt / project widths per row so it doesn't read as a grid. */
const SESSION_ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ["58%", "90%", "40%"],
  ["46%", "78%", "32%"],
  ["62%", "86%", "44%"],
  ["50%", "72%", "30%"],
  ["54%", "88%", "38%"],
  ["44%", "70%", "34%"],
];

export function SessionsSkeleton() {
  return (
    <div class="panel skeleton-panel" aria-busy="true" aria-live="polite">
      <div class="skeleton-actions">
        {ACTION_WIDTHS.map((w, i) => (
          <SkeletonBlock key={i} width={w} height="var(--h-control-sm)" />
        ))}
      </div>

      <div class="search-row">
        <SkeletonBlock height="var(--h-control)" />
        <SkeletonBlock width="var(--h-control)" height="var(--h-control)" />
      </div>

      <div class="skeleton-filter-row">
        <SkeletonBlock height="var(--h-control)" />
        <SkeletonBlock height="var(--h-control)" />
      </div>

      <div class="skeleton-chips-row">
        <SkeletonBlock width={180} height="var(--h-control-sm)" radius={6} />
      </div>

      <div class="list skeleton-list-rows">
        {SESSION_ROWS.map(([title, prompt, proj], i) => (
          <div class="item session-item skeleton-session" key={i} aria-hidden="true">
            <div class="skeleton-session-row1">
              <SkeletonLine width={title} />
              <SkeletonLine width={36} height={8} />
            </div>
            <SkeletonLine width={prompt} height={8} />
            <div class="skeleton-session-row1">
              <SkeletonBlock width={48} height={14} radius={8} />
              <SkeletonLine width={proj} height={8} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
