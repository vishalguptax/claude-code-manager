/**
 * One marketplace row: where plugins came from, whether it is actually
 * cloned on disk, and how the policy treats it.
 *
 * Not clickable — a marketplace has no action of its own; the plugins it
 * supplies are the actionable things. It still carries `.plg-item` so the two
 * row kinds share one padding, divider and density rule, and it deliberately
 * does NOT carry `.list-item`: that class brings the pointer cursor and hover
 * fill, which would promise a click this row cannot honour.
 */
import { Badge } from "../../../../../webview/shared/ui";
import type { MarketplaceEntry } from "../../../types";
import { SCOPE_LABEL, sourceSummary, TRUST_LABEL, trustVariant } from "../../lib";

export interface MarketplaceItemProps {
  marketplace: MarketplaceEntry;
}

export function MarketplaceItem({ marketplace: mkt }: MarketplaceItemProps) {
  const declared = mkt.declaredIn.map((s) => SCOPE_LABEL[s]).join(", ");
  return (
    <div class="plg-item plg-mkt">
      <div class="plg-item-row1">
        <span class="plg-item-name" title={mkt.name}>
          {mkt.name}
        </span>
        <Badge
          text={`${mkt.pluginCount}`}
          variant="count"
          title={`${mkt.pluginCount} plugin${mkt.pluginCount === 1 ? "" : "s"}`}
        />
        <Badge text={TRUST_LABEL[mkt.trust]} variant={trustVariant(mkt.trust)} />
      </div>

      <div class="plg-item-source" title={mkt.installLocation || undefined}>
        {sourceSummary(mkt.sourceKind, mkt.sourceLabel)}
      </div>

      {mkt.registered ? null : declared === "" ? (
        // A plugin id names this marketplace, but nothing ever added it — the
        // finding this tab exists for, so it keeps the warning treatment.
        <div class="plg-item-warning" role="note">
          A plugin points at this marketplace, but it was never added on this machine.
        </div>
      ) : (
        // Merely pending: Claude Code fetches it on next use. A quiet note,
        // not a warning.
        <div class="plg-note" role="note">
          Listed in {declared} settings, but Claude Code has not downloaded it yet.
        </div>
      )}
    </div>
  );
}
