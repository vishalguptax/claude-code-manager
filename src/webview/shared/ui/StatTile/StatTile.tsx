/**
 * A figure with its label underneath, in a tile.
 *
 * Account invented this for its usage numbers and the session transcript grew
 * its own flat `.d-stat` version for the same job — a number, a word, four of
 * them in a row. They rendered at different sizes, different weights, and only
 * one of them was a tile, so the same information looked like two different
 * kinds of thing on two tabs.
 *
 * Four across is the shape that fails first: at a 340px sidebar it gives each
 * figure about 75px, and "397.2k" in a tile labelled "tokens" does not fit in
 * 75px. <StatTileGrid> is therefore two columns at every width, which is also
 * why it is a grid component rather than a note in a comment telling the next
 * caller to use two.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";

export interface StatTileProps {
  /** The figure, already formatted — this component does not format. */
  value: string;
  /** What it counts. Lowercase; the tile is not a heading. */
  label: string;
  /** Hover tooltip, for a figure that needs an explanation (cache reads). */
  title?: string;
}

export function StatTile({ value, label, title }: StatTileProps) {
  return (
    <div class="stat-tile" title={title}>
      <div class="stat-tile-value">{value}</div>
      <div class="stat-tile-label">{label}</div>
    </div>
  );
}

export interface StatTileGridProps {
  /** Placement only — the grid owns its dividers, callers own their insets. */
  class?: string;
  children?: ComponentChildren;
}

/**
 * Two columns, fixed. Not `auto-fit`: that picked whatever count the sidebar
 * allowed, which at a typical width was three — orphaning a fourth tile on a
 * row of its own so the block read as a mistake.
 */
export function StatTileGrid({ class: cls, children }: StatTileGridProps) {
  return <div class={cx("stat-tile-grid", cls)}>{children}</div>;
}
