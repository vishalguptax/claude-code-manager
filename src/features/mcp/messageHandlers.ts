/**
 * Host-side message dispatch for the MCP feature. The feature owns its own
 * handler logic; every inbound message is validated against the shared
 * valibot schema before it is acted on (malformed messages are logged and
 * rejected, the handler returns without side effects).
 *
 * The handler depends only on a narrow {@link McpHostContext} so it never
 * reaches into another feature's provider — the sessions panel builds that
 * context and delegates MCP messages here.
 */
import * as vscode from "vscode";
import * as path from "path";
import {
  addMcpServer,
  deleteMcpServer,
  globalMcpFileFor,
  globalMcpConfigFile,
  parseMcpServers,
  readMcpAuthNeeds,
  setProjectMcpServerDisabled,
  updateMcpServer,
} from "./parser";
import { parseMessage } from "../../shared/protocol/schemas";
import type { McpServer, McpServerScope } from "./types";

/** Narrow host surface the MCP handler needs. Implemented by the provider. */
export interface McpHostContext {
  /** The live webview, or undefined if the view is not currently resolved. */
  getWebview(): vscode.Webview | undefined;
  /** Absolute workspace path, or undefined when no folder is open. */
  getWorkspace(): string | undefined;
  /** Cache the parsed server list so other host code can read it. */
  setMcpServers(servers: McpServer[]): void;
  /** Run a shell command in a terminal (e.g. `claude mcp login x`). */
  runShellCommand(label: string, command: string): void;
  /** Open `claude` and type a slash command after it enters the REPL (e.g. `/mcp`). */
  runSlashCommand(label: string, slash: string): void;
}

/** Coerce an arbitrary string scope to a known MCP scope, else null. */
function asScope(value: string): McpServerScope | null {
  return value === "global" || value === "project" || value === "plugin" ? value : null;
}

/**
 * Single-quote a server name for safe use in the terminal command line
 * (server names are user-controlled config keys). Wraps in single
 * quotes and escapes any embedded single quote — works for bash/zsh;
 * on Windows the value reaches `claude` as a literal argument.
 */
function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Re-parse the server list + the auth-needs cache and push both to the
 * webview in one message. The `mcpServers` schema accepts `data:
 * unknown`, so piggybacking { servers, authNeeds } avoids adding a
 * second message type for what is conceptually one MCP snapshot. Any
 * config parse failures ride the message's `errors` field.
 */
function pushServers(ctx: McpHostContext, wv: vscode.Webview): void {
  const { servers, errors } = parseMcpServers(ctx.getWorkspace());
  ctx.setMcpServers(servers);
  wv.postMessage({
    type: "mcpServers",
    data: { servers, authNeeds: readMcpAuthNeeds() },
    errors,
  });
}

/**
 * Validate and handle one MCP webview→host message.
 *
 * @returns `true` if the message was an MCP message (handled or rejected),
 *   `false` if it is not an MCP message and the caller should try other
 *   handlers.
 */
export async function handleMcpMessage(
  raw: unknown,
  ctx: McpHostContext,
): Promise<boolean> {
  let msg: ReturnType<typeof parseMessage>;
  try {
    msg = parseMessage(raw);
  } catch (err) {
    // Only claim+reject messages that look like ours; otherwise defer.
    const type = (raw as { type?: unknown } | null)?.type;
    const MCP_TYPES = new Set([
      "getMcpServers",
      "openMcpConfig",
      "toggleMcpServer",
      "deleteMcpServer",
      "addMcpServer",
      "updateMcpServer",
      "authenticateMcp",
      "logoutMcp",
      "reconnectMcp",
      "mcpListStatus",
    ]);
    if (typeof type === "string" && MCP_TYPES.has(type)) {
      console.error("[claude-manager] rejected malformed MCP message", err);
      return true;
    }
    return false;
  }

  const wv = ctx.getWebview();

  switch (msg.type) {
    case "getMcpServers": {
      if (wv) pushServers(ctx, wv);
      return true;
    }

    case "openMcpConfig": {
      const scope = asScope(msg.scope);
      if (scope === "plugin") {
        vscode.window.showErrorMessage(
          "Plugin MCP servers are managed by Claude Code's /plugin command.",
        );
        return true;
      }
      let configPath: string;
      if (scope === "project") {
        const workspace = ctx.getWorkspace();
        if (!workspace) {
          vscode.window.showErrorMessage("No workspace folder open");
          return true;
        }
        configPath = path.join(workspace, ".mcp.json");
      } else {
        // Global servers live in ~/.claude.json, not the legacy
        // ~/.claude/mcp.json. Route by the specific server's owning
        // file when we have its name; otherwise open the canonical
        // global config.
        configPath = msg.name ? globalMcpFileFor(msg.name) : globalMcpConfigFile();
      }
      try {
        const doc = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${configPath}`);
      }
      return true;
    }

    case "toggleMcpServer": {
      const scope = asScope(msg.scope);
      // Only project-scope servers can be toggled: Claude Code's
      // enable/disable mechanism (the disabledMcpjsonServers arrays)
      // governs project .mcp.json servers only. Global and plugin
      // servers have no such switch.
      if (scope !== "project") {
        vscode.window.showErrorMessage(
          `"${msg.name}" can't be disabled from here — only project (.mcp.json) servers support enable/disable. Edit the config to remove a global or plugin server.`,
        );
        return true;
      }
      const workspace = ctx.getWorkspace();
      if (!workspace) {
        vscode.window.showErrorMessage("No workspace folder open");
        return true;
      }
      const ok = setProjectMcpServerDisabled(msg.name, msg.disabled, workspace);
      if (ok && wv) {
        pushServers(ctx, wv);
      } else if (!ok) {
        vscode.window.showErrorMessage(
          `Failed to ${msg.disabled ? "disable" : "enable"} ${msg.name}`,
        );
      }
      return true;
    }

    case "deleteMcpServer": {
      const scope = asScope(msg.scope);
      if (scope === null || scope === "plugin") {
        vscode.window.showErrorMessage(
          `"${msg.name}" is provided by a plugin — manage it via /plugin.`,
        );
        return true;
      }
      const target =
        scope === "project" ? "the project's .mcp.json" : globalMcpFileFor(msg.name);
      const choice = await vscode.window.showWarningMessage(
        `Delete MCP server "${msg.name}"?`,
        {
          modal: true,
          detail: `This will remove the server entry from ${target}.`,
        },
        "Delete",
      );
      if (choice !== "Delete") return true;
      const ok = deleteMcpServer(msg.name, scope, ctx.getWorkspace());
      if (ok && wv) {
        pushServers(ctx, wv);
      } else if (!ok) {
        vscode.window.showErrorMessage(`Failed to delete ${msg.name}`);
      }
      return true;
    }

    case "addMcpServer": {
      const result = addMcpServer(msg.server, ctx.getWorkspace());
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to add MCP server.");
      } else if (wv) {
        pushServers(ctx, wv);
      }
      return true;
    }

    case "updateMcpServer": {
      const result = updateMcpServer(msg.originalName, msg.server, ctx.getWorkspace());
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to update MCP server.");
      } else if (wv) {
        pushServers(ctx, wv);
      }
      return true;
    }

    case "authenticateMcp": {
      // `claude mcp login <name>` runs the OAuth flow from the terminal.
      ctx.runShellCommand(`mcp login ${msg.name}`, `claude mcp login ${shellArg(msg.name)}`);
      return true;
    }

    case "logoutMcp": {
      ctx.runShellCommand(`mcp logout ${msg.name}`, `claude mcp logout ${shellArg(msg.name)}`);
      return true;
    }

    case "reconnectMcp": {
      // No programmatic reconnect exists — the /mcp panel is the manual
      // reconnect + status surface.
      ctx.runSlashCommand("mcp", "/mcp");
      return true;
    }

    case "mcpListStatus": {
      // Connection status for url-transport servers: Claude Code probes,
      // the extension only launches the command.
      ctx.runShellCommand("mcp list", "claude mcp list");
      return true;
    }

    default:
      return false;
  }
}
