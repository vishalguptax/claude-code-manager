/**
 * One row of the Browse view: a plugin a marketplace offers.
 *
 * Built from the same `.plg-item` row as an installed plugin, so the two
 * lists share rhythm, divider and density. What differs is what the row has
 * to say: not "what decided its state" but "what is it" — so the description
 * leads, clamped to two lines, with the catalog's category and author under
 * it. Clicking opens the plugin's install view.
 */
import { Badge, ListItem } from "../../../../../webview/shared/ui";
import type { AvailablePlugin } from "../../../types";
import { catalogByline } from "../../lib";

export interface AvailableItemProps {
  plugin: AvailablePlugin;
  onSelect: (plugin: AvailablePlugin) => void;
}

export function AvailableItem({ plugin, onSelect }: AvailableItemProps) {
  const byline = catalogByline(plugin);
  return (
    <ListItem class="plg-item" onClick={() => onSelect(plugin)}>
      <div class="plg-item-row1">
        <span class="plg-item-name" title={plugin.id}>
          {plugin.name}
        </span>
        {plugin.installed ? <Badge text="installed" variant="status" /> : null}
      </div>
      {plugin.description === "" ? null : (
        <div class="plg-item-detail plg-avail-desc" title={plugin.description}>
          {plugin.description}
        </div>
      )}
      {byline === "" ? null : <div class="plg-avail-byline">{byline}</div>}
    </ListItem>
  );
}
