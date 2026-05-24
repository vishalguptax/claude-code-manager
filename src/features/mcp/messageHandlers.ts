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
import * as os from "os";
import { parseMessage } from "../../shared/protocol/schemas";
import { deleteMcpServer, parseMcpServers, toggleMcpServer } from "./parser";
import type { McpServer, McpServerScope } from "./types";

/** Narrow host surface the MCP handler needs. Implemented by the provider. */
export interface McpHostContext {
  /** The live webview, or undefined if the view is not currently resolved. */
  getWebview(): vscode.Webview | undefined;
  /** Absolute workspace path, or undefined when no folder is open. */
  getWorkspace(): string | undefined;
  /** Cache the parsed server list so other host code can read it. */
  setMcpServers(servers: McpServer[]): void;
}

/** Coerce an arbitrary string scope to a known MCP scope, else null. */
function asScope(value: string): McpServerScope | null {
  return value === "global" || value === "project" || value === "plugin" ? value : null;
}

/** Re-parse the server list, cache it, and push it to the webview. */
function pushServers(ctx: McpHostContext, wv: vscode.Webview): void {
  const servers = parseMcpServers(ctx.getWorkspace());
  ctx.setMcpServers(servers);
  wv.postMessage({ type: "mcpServers", data: servers });
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
    if (
      type === "getMcpServers" ||
      type === "openMcpConfig" ||
      type === "toggleMcpServer" ||
      type === "deleteMcpServer"
    ) {
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
        configPath = path.join(os.homedir(), ".claude", "mcp.json");
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
      if (scope === null || scope === "plugin") {
        vscode.window.showErrorMessage(
          `"${msg.name}" is provided by a plugin — manage it via /plugin.`,
        );
        return true;
      }
      const ok = toggleMcpServer(msg.name, scope, msg.disabled, ctx.getWorkspace());
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
      const choice = await vscode.window.showWarningMessage(
        `Delete MCP server "${msg.name}"?`,
        {
          modal: true,
          detail: `This will remove the server entry from your ${scope} .mcp.json config.`,
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

    default:
      return false;
  }
}
