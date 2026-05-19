/**
 * MCP server detail view — shows the full configuration of a selected MCP server.
 * Masks sensitive environment variable values (API keys).
 */

import { esc, flash } from "../../../../webview/utils";
import { icon } from "../../../../webview/icons";
import { getSelectedServer } from "../state";
import { sendOpenMcpConfig, sendToggleMcpServer, sendDeleteMcpServer } from "../api";
import { sendNewSession } from "../../../sessions/webview/api";
import { showMcpList } from "./listView";

/**
 * Mask a sensitive value, showing only the first 4 and last 4 characters.
 * Values shorter than 12 characters are fully masked.
 *
 * @param value - The raw string value to mask
 * @returns The masked string
 */
function maskSensitiveValue(value: string): string {
  if (value.length <= 8) {
    return "****";
  }
  return value.slice(0, 4) + "****" + value.slice(-4);
}

/**
 * Render the detail view for the currently selected MCP server.
 * Shows server name, type, connection details, and environment variables
 * with sensitive values masked.
 *
 * @param container - The DOM element to render into
 */
export function showMcpDetail(container: HTMLElement): void {
  const server = getSelectedServer();
  if (!server) {
    showMcpList(container);
    return;
  }

  let envHtml = "";
  if (server.env && Object.keys(server.env).length > 0) {
    const envRows = Object.entries(server.env)
      .map(([key, value]) => {
        const masked = maskSensitiveValue(value);
        return `<div class="mcp-env-row">
          <span class="mcp-env-key">${esc(key)}</span>
          <span class="mcp-env-value">${esc(masked)}</span>
        </div>`;
      })
      .join("");

    envHtml = `
      <div class="mcp-detail-section">
        <div class="mcp-detail-label">Environment Variables</div>
        ${envRows}
      </div>`;
  }

  let connectionHtml = "";
  if (server.type === "http") {
    connectionHtml = `
      <div class="mcp-detail-kv"><span class="mcp-detail-k">URL</span><span class="mcp-detail-v mono">${esc(server.url || "")}</span></div>`;
  } else {
    connectionHtml = `
      <div class="mcp-detail-kv"><span class="mcp-detail-k">Command</span><span class="mcp-detail-v mono">${esc(server.command || "")}</span></div>
      ${server.args && server.args.length > 0 ? `<div class="mcp-detail-kv"><span class="mcp-detail-k">Args</span><span class="mcp-detail-v mono">${esc(server.args.join(" "))}</span></div>` : ""}`;
  }

  container.innerHTML = `<div class="panel">
    <button class="back-btn" id="mcpGoBack">${icon("arrow-left")} Back</button>

    <div class="mcp-detail-head">
      <div class="mcp-detail-title">${esc(server.name)}</div>
      <span class="mcp-type-badge mcp-type-${server.type}">${server.type}</span>
      <span class="mcp-scope-badge mcp-scope-${server.scope}">${server.scope}</span>
    </div>

    <div class="d-actions">
      ${server.scope !== "plugin" ? `<button class="btn primary" id="mcpToggle">${icon(server.disabled ? "play" : "x")} ${server.disabled ? "Enable" : "Disable"}</button>` : ""}
      <button class="btn" id="mcpOpenClaude">${icon("play")} Open Claude</button>
      <button class="btn" id="mcpCopyName">${icon("copy")} Copy Name</button>
      ${server.scope !== "plugin" ? `<button class="btn" id="mcpOpenConfig">${icon("external-link")} Open Config</button>` : ""}
      ${server.scope !== "plugin" ? `<button class="btn del" id="mcpDelete">${icon("trash-2")} Delete</button>` : `<span class="mcp-readonly-note">Owned by plugin ${esc(server.pluginName ?? "")} — managed by Claude Code's <code>/plugin</code> command.</span>`}
    </div>

    <div class="mcp-detail-section">
      <div class="mcp-detail-label">Connection</div>
      ${connectionHtml}
    </div>

    ${envHtml}
  </div>`;

  container.querySelector("#mcpGoBack")?.addEventListener("click", () => {
    showMcpList(container);
  });

  container.querySelector("#mcpOpenConfig")?.addEventListener("click", () => {
    sendOpenMcpConfig(server.scope);
  });

  container.querySelector("#mcpOpenClaude")?.addEventListener("click", () => sendNewSession());

  container.querySelector("#mcpCopyName")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(server.name);
    flash("mcpCopyName", "Copied!");
  });

  container.querySelector("#mcpToggle")?.addEventListener("click", () => {
    sendToggleMcpServer(server.name, server.scope, !server.disabled);
  });

  container.querySelector("#mcpDelete")?.addEventListener("click", () => {
    sendDeleteMcpServer(server.name, server.scope);
  });
}
