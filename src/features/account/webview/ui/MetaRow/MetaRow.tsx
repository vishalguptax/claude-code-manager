/**
 * A key/value meta row. `title` adds a hover tooltip on the whole row
 * (used by the project breakdown to show the full path). `total` adds
 * the summary-line styling used for the cost total.
 *
 * Layout: by default the value sits close to the label (a single capped gap),
 * which reads cleanly for short identity values like "Credentials: File" —
 * `space-between` to the panel edges left an awkward orphaned gap there. Set
 * `numeric` for value-as-figure rows (token counts, streaks, costs); those push
 * the value to the right edge with tabular-nums so a column of numbers aligns.
 */

import { cx } from "../../../../../webview/shared/lib";

export interface MetaRowProps {
  k: string;
  v: string;
  title?: string;
  total?: boolean;
  /** Right-align the value with tabular figures (counts, costs, durations). */
  numeric?: boolean;
}

export function MetaRow({ k, v, title, total, numeric }: MetaRowProps) {
  return (
    <div
      class={cx("acct-meta-row", total && "acct-meta-row-total", numeric && "acct-meta-row-numeric")}
      title={title}
    >
      <span class="acct-meta-k">{k}</span>
      <span class="acct-meta-v">{v}</span>
    </div>
  );
}
