/**
 * What a given MCP server can actually be asked to do, and the menu that
 * offers it.
 *
 * These rules are not cosmetic — they mirror what Claude Code itself supports,
 * and offering an action it will refuse produces an error message instead of a
 * result. They lived only inside DetailView, so the row context menu would
 * have had to restate them and the two would have drifted the first time
 * Claude Code changed a rule.
 */
import type { ContextMenuItem } from "../../../../webview/shared/ui";
import type { McpServer } from "../../types";
import { isUrlTransport } from "./helpers";

/**
 * Plugin servers are owned by the plugin that ships them and are managed
 * through Claude Code's `/plugin` command, so nothing here may rewrite them.
 */
export function canEditMcp(server: McpServer): boolean {
  return server.scope !== "plugin";
}

/**
 * Only project `.mcp.json` servers can be switched off. Claude Code's toggle
 * is the `disabledMcpjsonServers` / `enabledMcpjsonServers` arrays, which
 * govern project scope alone — a user-scope server is removed from
 * `~/.claude.json`, not disabled, and a plugin server is the plugin's.
 */
export function canToggleMcp(server: McpServer): boolean {
  return server.scope === "project";
}

/**
 * Auth is OAuth (`claude mcp login` / `logout`), which is a remote-transport
 * concept. An stdio server runs a local command and has none.
 */
export function canAuthMcp(server: McpServer): boolean {
  return server.scope !== "plugin" && isUrlTransport(server);
}

export interface McpMenuHandlers {
  onEdit: (server: McpServer) => void;
  onToggle: (server: McpServer) => void;
  onDelete: (server: McpServer) => void;
  onCopyName: (name: string) => void;
  onOpenConfig: (server: McpServer) => void;
  onAuthenticate: (name: string) => void;
  onLogout: (name: string) => void;
}

/**
 * The right-click menu for one server row. Every entry is an action the server
 * actually supports; an action it does not support is absent rather than
 * present-and-failing.
 */
export function buildMcpMenu(server: McpServer, h: McpMenuHandlers): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  if (canEditMcp(server)) {
    items.push({ label: "Edit…", icon: "pencil", onSelect: () => h.onEdit(server) });
  }
  if (canToggleMcp(server)) {
    items.push({
      label: server.disabled ? "Enable" : "Disable",
      icon: server.disabled ? "play" : "x",
      onSelect: () => h.onToggle(server),
    });
  }
  if (canAuthMcp(server)) {
    items.push({
      label: "Authenticate",
      icon: "key-round",
      separatorBefore: items.length > 0,
      onSelect: () => h.onAuthenticate(server.name),
    });
    items.push({ label: "Clear Auth", icon: "log-out", onSelect: () => h.onLogout(server.name) });
  }

  items.push({
    label: "Copy Name",
    icon: "copy",
    separatorBefore: items.length > 0,
    onSelect: () => h.onCopyName(server.name),
  });
  if (canEditMcp(server)) {
    items.push({
      label: "Open Config",
      icon: "external-link",
      onSelect: () => h.onOpenConfig(server),
    });
    items.push({
      label: "Delete",
      icon: "trash-2",
      danger: true,
      separatorBefore: true,
      onSelect: () => h.onDelete(server),
    });
  }
  return items;
}
