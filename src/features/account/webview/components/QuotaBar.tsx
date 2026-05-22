/**
 * One quota "window" row: label, accessible progress bar, percentage,
 * and a human reset timer. Width is driven by a CSS custom property
 * (`--fill`) so no inline `style` string is needed — the stylesheet
 * reads `width: var(--fill)`.
 */

import { cx } from "../../../../webview/utils/classnames";
import type { QuotaWindow } from "../../quota";
import { formatResetsIn, quotaTone } from "../format";

export interface QuotaBarProps {
  label: string;
  window: QuotaWindow;
}

export function QuotaBar({ label, window }: QuotaBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(window.utilization)));
  const tone = quotaTone(window.utilization);
  const resetsLabel = formatResetsIn(window.resetsAt);
  return (
    <div class="acct-quota-row">
      <div class="acct-quota-row-head">
        <span class="acct-quota-label">{label}</span>
        <span class="acct-quota-pct">{pct}%</span>
      </div>
      <div
        class="acct-quota-bar"
        role="progressbar"
        aria-label={`${label} utilization`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          class={cx("acct-quota-bar-fill", `tone-${tone}`)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {resetsLabel ? <div class="acct-quota-sub">{resetsLabel}</div> : null}
    </div>
  );
}
