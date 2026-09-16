/**
 * One plugin row.
 *
 * The row's job is to answer "is Claude Code loading this, and what decided
 * that" in one glance: the state chip, the one-line reason, and — when more
 * than one settings file has an opinion — the override chain that shows
 * which one won.
 */
import { cx } from "../../../../../webview/shared/lib";
import { Badge, Button, ListItem } from "../../../../../webview/shared/ui";
import type { PluginEntry } from "../../../types";
import {
  canToggle,
  overrideChain,
  STATUS_LABEL,
  statusVariant,
  stateSummary,
} from "../../lib";

export interface PluginItemProps {
  plugin: PluginEntry;
  onCopyId: (id: string) => void;
  /** Flip the plugin at the scope that currently decides it. */
  onToggle: (plugin: PluginEntry) => void;
  /** Right-click the row for the plugin's actions. */
  onContextMenu: (plugin: PluginEntry, x: number, y: number) => void;
}

export function PluginItem({ plugin, onCopyId, onToggle, onContextMenu }: PluginItemProps) {
  const summary = stateSummary(plugin);
  const chain = overrideChain(plugin);
  const toggleable = canToggle(plugin);
  const action = plugin.enabled ? "Disable" : "Enable";

  /**
   * Open the actions menu. Activating the row (click or Enter) does the same
   * thing as right-clicking it, so every action is reachable from the
   * keyboard — `ListItem` forwards a keyboard activation through `onClick`,
   * and that synthetic event has no pointer coordinates, so the menu anchors
   * to the row's own box instead.
   */
  const openMenu = (e: MouseEvent): void => {
    const hasPointer = e.clientX !== undefined && (e.clientX !== 0 || e.clientY !== 0);
    if (hasPointer) {
      onContextMenu(plugin, e.clientX, e.clientY);
      return;
    }
    const row = e.currentTarget as HTMLElement | null;
    const box = row?.getBoundingClientRect();
    onContextMenu(plugin, box ? box.left + 8 : 0, box ? box.bottom - 4 : 0);
  };

  return (
    <ListItem
      class={cx("plg-item", !plugin.enabled && "plg-item-off")}
      onClick={openMenu}
      onContextMenu={(e) => {
        // Replace VS Code's own webview menu with the plugin's actions.
        e.preventDefault();
        openMenu(e);
      }}
    >
      <div class="plg-item-row1">
        <span class="plg-item-name" title={plugin.id}>
          {plugin.name}
        </span>
        <Button
          variant="icon"
          iconName="copy"
          class="item-copy-btn"
          title="Copy plugin id"
          ariaLabel={`Copy plugin id ${plugin.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopyId(plugin.id);
          }}
        />
        {toggleable ? (
          <button
            type="button"
            role="switch"
            aria-checked={plugin.enabled}
            class="plg-switch"
            // The visible label is the row's name, which CSS ellipsizes; the
            // accessible name has to come from an attribute instead.
            aria-label={`${action} ${plugin.id}`}
            title={`${action} ${plugin.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(plugin);
            }}
          >
            <span class="plg-switch-knob" />
          </button>
        ) : null}
        <Badge text={STATUS_LABEL[plugin.status]} variant={statusVariant(plugin.status)} />
      </div>

      <div class="plg-item-source" title={`Marketplace: ${plugin.marketplace}`}>
        {plugin.marketplace}
        {plugin.version === "" ? null : <span class="plg-item-version">{plugin.version}</span>}
      </div>

      <div class="plg-item-detail">{summary}</div>

      {plugin.untrustedSource ? (
        <div class="plg-item-warning" role="note">
          Active from <strong>{plugin.marketplace}</strong>, which the marketplace policy does
          not allow.
        </div>
      ) : null}

      {chain === "" ? null : (
        <div class="plg-item-chain" title="Settings precedence, lowest first">
          {chain}
        </div>
      )}
    </ListItem>
  );
}
