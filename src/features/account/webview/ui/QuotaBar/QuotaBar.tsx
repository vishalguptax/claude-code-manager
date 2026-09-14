/**
 * One quota "window" row: label, accessible progress bar, percentage,
 * and a human reset timer. Width is driven by an inline `width` derived
 * from the clamped utilization (data-driven, no static class equivalent);
 * all appearance comes from `.acct-quota-*` classes.
 *
 * When a burn-rate projection is available the bar carries it visually: a
 * faint segment ahead of the fill marks where this window lands by reset,
 * and a countdown to the cap sits opposite the reset timer. Two timers on
 * one line is the whole comparison — whichever is shorter happens first —
 * where the earlier wording made the reader subtract one from the other.
 *
 * A one-line verdict sits under both, with an info icon beside it for the
 * rate behind the projection. The graphic is compact, which is not the
 * same as legible: nobody meeting a faint bar for the first time knows
 * what it means. The verdict answers that in the open; the icon is there
 * so the longer reading is something the user can SEE is available,
 * rather than a tooltip on the bar that only rewards hovering by luck.
 */

import { Icon } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import { now } from "../../../../../webview/shared/model";
import type { QuotaWindow } from "../../../quota";
import { formatResetsIn, paceDisplay, quotaTone, type Pace } from "../../lib";

export interface QuotaBarProps {
  label: string;
  window: QuotaWindow;
  /**
   * Burn-rate projection for this window, when one can be computed. Only
   * the weekly window passes it — see ../../lib/pace for why the 5-hour
   * one cannot support a projection.
   */
  pace?: Pace | null;
}

export function QuotaBar({ label, window, pace }: QuotaBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(window.utilization)));
  const tone = quotaTone(window.utilization);
  // Read the shared clock so both timers tick down live (and the reset
  // flips to "outdated" when the window rolls over) without a data change.
  const resetsLabel = formatResetsIn(window.resetsAt, now.value);
  const projection = pace ? paceDisplay(pace, now.value) : null;
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
        {projection ? (
          <div
            class={cx("acct-quota-bar-ghost", `pace-${pace?.verdict}`)}
            style={{ width: `${projection.projectedWidth}%` }}
            aria-hidden="true"
          />
        ) : null}
        <div class={cx("acct-quota-bar-fill", `tone-${tone}`)} style={{ width: `${pct}%` }} />
      </div>
      {resetsLabel || projection?.countdown ? (
        <div class="acct-quota-sub">
          <span>{resetsLabel}</span>
          {projection?.countdown ? (
            <span class="acct-quota-countdown">{projection.countdown}</span>
          ) : null}
        </div>
      ) : null}
      {projection ? (
        <div class={cx("acct-quota-verdict", `pace-${pace?.verdict}`)}>
          <span>{projection.sentence}</span>
          <span
            class="acct-quota-info"
            role="img"
            tabIndex={0}
            title={projection.title}
            aria-label={projection.title}
          >
            <Icon name="info" size={12} />
          </span>
        </div>
      ) : null}
    </div>
  );
}
