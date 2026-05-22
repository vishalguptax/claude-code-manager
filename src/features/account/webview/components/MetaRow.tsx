/**
 * A key/value meta row. `title` adds a hover tooltip on the whole row
 * (used by the project breakdown to show the full path). `total` adds
 * the summary-line styling used for the cost total.
 */

import { cx } from "../../../../webview/shared/lib";

export interface MetaRowProps {
  k: string;
  v: string;
  title?: string;
  total?: boolean;
}

export function MetaRow({ k, v, title, total }: MetaRowProps) {
  return (
    <div class={cx("acct-meta-row", total && "acct-meta-row-total")} title={title}>
      <span class="acct-meta-k">{k}</span>
      <span class="acct-meta-v">{v}</span>
    </div>
  );
}
