/**
 * A single MCP server row in the list view. Shows the server name, a copy
 * button, transport/scope/disabled badges, and a one-line connection preview.
 * Selection and copy are surfaced as callbacks so the row stays presentational.
 */
import { cx } from "../../../../../webview/shared/lib";
import { Button, ListItem } from "../../../../../webview/shared/ui";
import { connectionPreview } from "../../lib";
import type { McpServer } from "../../../types";
import { DisabledBadge, ReadOnlyBadge, TypeBadge } from "../McpBadges";

export interface McpItemProps {
  server: McpServer;
  active: boolean;
  onSelect: (server: McpServer) => void;
  onCopyName: (name: string) => void;
}

export function McpItem({ server, active, onSelect, onCopyName }: McpItemProps) {
  return (
    <ListItem
      active={active}
      class={cx("mcp-item", server.disabled && "mcp-disabled")}
      onClick={() => onSelect(server)}
    >
      <div class="mcp-item-row1">
        <span class="mcp-item-name">{server.name}</span>
        <Button
          variant="icon"
          iconName="copy"
          class="item-copy-btn"
          title="Copy name"
          ariaLabel="Copy name"
          onClick={(e) => {
            e.stopPropagation();
            onCopyName(server.name);
          }}
        />
        {server.disabled ? <DisabledBadge /> : null}
        <TypeBadge type={server.type} />
        {server.scope === "plugin" ? <ReadOnlyBadge pluginName={server.pluginName} /> : null}
      </div>
      <div class="mcp-item-detail">{connectionPreview(server)}</div>
    </ListItem>
  );
}
