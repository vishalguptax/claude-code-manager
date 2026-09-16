/**
 * One marketplace row: where plugins came from, whether it is actually
 * cloned on disk, and how the policy treats it.
 *
 * Not clickable — a marketplace has no action of its own; the plugins it
 * supplies are the actionable things.
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
    <div class="list-item plg-mkt">
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

      <div class="plg-item-detail" title={mkt.installLocation || undefined}>
        {sourceSummary(mkt.sourceKind, mkt.sourceLabel)}
      </div>

      {mkt.registered ? null : declared === "" ? (
        <div class="plg-item-warning" role="note">
          Referenced by a plugin id but never registered on this machine.
        </div>
      ) : (
        <div class="plg-item-warning" role="note">
          Pre-registered in {declared} settings but not cloned — Claude Code has not fetched it
          yet.
        </div>
      )}
    </div>
  );
}
