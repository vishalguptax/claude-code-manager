/**
 * A single MCP server row in the list view. Shows the server name, a copy
 * button, transport/scope/disabled badges, and a one-line connection preview.
 * Selection and copy are surfaced as callbacks so the row stays presentational.
 */
import { cx } from "../../../../webview/utils/classnames";
import { Icon } from "../../../../webview/components/Icon";
import { ListItem } from "../../../../webview/components/ListItem";
import type { McpServer } from "../../types";
import { DisabledBadge, ReadOnlyBadge, TypeBadge } from "./McpBadges";

const PREVIEW_MAX = 60;

/** Build the single-line connection preview for a server row. */
export function connectionPreview(server: McpServer): string {
  const detail =
    server.type === "http"
      ? (server.url ?? "")
      : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");
  return detail.length > PREVIEW_MAX ? `${detail.slice(0, PREVIEW_MAX)}...` : detail;
}

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
        <button
          type="button"
          class="item-copy-btn"
          title="Copy name"
          onClick={(e) => {
            e.stopPropagation();
            onCopyName(server.name);
          }}
        >
          <Icon name="copy" size={14} />
        </button>
        {server.disabled ? <DisabledBadge /> : null}
        <TypeBadge type={server.type} />
        {server.scope === "plugin" ? <ReadOnlyBadge pluginName={server.pluginName} /> : null}
      </div>
      <div class="mcp-item-detail">{connectionPreview(server)}</div>
    </ListItem>
  );
}
