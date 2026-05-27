/**
 * Shared loading skeleton for the five structurally-identical list features —
 * skills, commands, hooks, mcp, agents. They all render the same shell: a
 * `.search-row` (search field + trailing icon buttons), an optional
 * `.scope-filter` segmented control, then a `.list` of `.item` rows (name line
 * + description line + a small scope badge).
 *
 * Mirroring that exact shell — same `.search-row` / `.scope-filter` / `.item`
 * insets and the `--h-control` field height — keeps the swap to real data free
 * of layout shift, so this one component stands in for all five rather than
 * five copies.
 */

import { SkeletonBlock, SkeletonLine } from "./Skeleton";

export interface ListSkeletonProps {
  /** Number of placeholder rows (default 14 — enough to fill a tall panel; the
   *  scrollable `.list` clips the overflow). */
  rows?: number;
  /** Render the scope-filter segmented placeholder (default true). */
  scopeFilter?: boolean;
}

/** Varied name/description widths so rows don't read as a stamped grid. */
const ROW_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["50%", "80%"],
  ["38%", "66%"],
  ["56%", "88%"],
  ["44%", "72%"],
  ["50%", "60%"],
  ["34%", "84%"],
  ["48%", "70%"],
  ["42%", "78%"],
];

export function ListSkeleton({ rows = 14, scopeFilter = true }: ListSkeletonProps) {
  return (
    <div class="panel skeleton-panel" aria-busy="true" aria-live="polite">
      <div class="search-row">
        {/* Search field fills the row; height matches --h-control so the field
            edge lands where the real <SearchInput> will. */}
        <SkeletonBlock height="var(--h-control)" />
        <SkeletonBlock width="var(--h-control)" height="var(--h-control)" />
      </div>

      {scopeFilter ? (
        <div class="skeleton-scope-row">
          <SkeletonBlock height="var(--h-control-sm)" radius={6} />
        </div>
      ) : null}

      <div class="list skeleton-list-rows">
        {Array.from({ length: rows }, (_, i) => {
          const [name, desc] = ROW_WIDTHS[i % ROW_WIDTHS.length];
          return (
            // Static placeholders, fixed order — index key is correct.
            <div class="item skeleton-item" key={i} aria-hidden="true">
              <div class="skeleton-item-row1">
                <SkeletonLine width={name} />
                <SkeletonBlock width={46} height={16} radius={8} />
              </div>
              <SkeletonLine width={desc} height={8} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
