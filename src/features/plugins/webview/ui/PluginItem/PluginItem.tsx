/**
 * One plugin row.
 *
 * The row's job is to answer "is Claude Code loading this, and what decided
 * that" in one glance: the state chip, the scope chip naming the settings
 * file that won, the one-line reason, and — when more than one file has an
 * opinion — the override chain that shows which one it beat.
 *
 * Shaped after `<McpItem>`: a shared `<ListItem>` carrying the feature's row
 * class, name + inline affordances on row 1, a muted mono detail line under
 * it. Clicking opens the detail view; right-click opens the row's actions.
 */
import { cx } from "../../../../../webview/shared/lib";
import { Badge, Button, ListItem, Tag } from "../../../../../webview/shared/ui";
import type { PluginEntry } from "../../../types";
import {
  canToggle,
  overrideSteps,
  SCOPE_LABEL,
  scopeTone,
  STATUS_LABEL,
  statusVariant,
  stateSummary,
} from "../../lib";

export interface PluginItemProps {
  plugin: PluginEntry;
  /** The row's detail view is open. */
  active?: boolean;
  onSelect: (plugin: PluginEntry) => void;
  onCopyId: (id: string) => void;
  /** Flip the plugin at the scope that currently decides it. */
  onToggle: (plugin: PluginEntry) => void;
  /** Right-click the row for the plugin's actions. */
  onContextMenu: (plugin: PluginEntry, x: number, y: number) => void;
}

export function PluginItem({
  plugin,
  active = false,
  onSelect,
  onCopyId,
  onToggle,
  onContextMenu,
}: PluginItemProps) {
  const steps = overrideSteps(plugin);
  const toggleable = canToggle(plugin);
  const action = plugin.enabled ? "Disable" : "Enable";
  const scope = plugin.decidedBy;

  return (
    <ListItem
      active={active}
      class={cx("plg-item", !plugin.enabled && "plg-item-off")}
      onClick={() => onSelect(plugin)}
      onContextMenu={(e) => {
        // Replace VS Code's own webview menu with the plugin's actions.
        e.preventDefault();
        onContextMenu(plugin, e.clientX, e.clientY);
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
          <Button
            variant="icon"
            // The glyph names the ACTION, not the state — the same way the
            // row's actions menu and the detail view's button do, so the
            // three controls for one job cannot read differently.
            iconName={plugin.enabled ? "eye-off" : "eye"}
            class="plg-item-toggle"
            // The visible label is the row's name, which CSS ellipsizes; the
            // accessible name has to come from an attribute instead.
            ariaLabel={`${action} ${plugin.id}`}
            title={`${action} ${plugin.id}`}
            onClick={(e) => {
              // The row itself opens the detail view.
              e.stopPropagation();
              onToggle(plugin);
            }}
          />
        ) : null}
        <Badge text={STATUS_LABEL[plugin.status]} variant={statusVariant(plugin.status)} />
        {scope ? (
          <Badge
            text={SCOPE_LABEL[scope]}
            scope={scopeTone(scope)}
            title={`Decided by ${SCOPE_LABEL[scope]} settings`}
          />
        ) : null}
      </div>

      <div class="plg-item-source" title={`Marketplace: ${plugin.marketplace}`}>
        {plugin.marketplace}
        {plugin.version === "" ? null : <span class="plg-item-version">{plugin.version}</span>}
      </div>

      <div class="plg-item-detail">{stateSummary(plugin)}</div>

      {plugin.untrustedSource ? (
        <div class="plg-item-warning" role="note">
          Running from <strong>{plugin.marketplace}</strong>, a marketplace your policy does
          not allow.
        </div>
      ) : null}

      {steps.length === 0 ? null : (
        <div class="plg-item-chain" title="Settings precedence, lowest first">
          {steps.map((step) => (
            <Tag
              key={step.scope}
              text={`${step.scope}: ${step.state}`}
              // The file that won is the answer; the ones it beat are context.
              class={cx("plg-chain-tag", step.winner && "is-winner")}
            />
          ))}
        </div>
      )}
    </ListItem>
  );
}
