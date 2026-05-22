/**
 * Detail view for a single MCP server. Shows the connection (command/args or
 * URL), environment variables with sensitive values masked, and scope-aware
 * action buttons (toggle/open-config/delete are hidden for read-only plugin
 * servers). Selecting "Back" clears the selection signal.
 */
import { useState } from "preact/hooks";
import { Icon } from "../../../../webview/shared/ui";
import type { McpServer } from "../../types";
import { ScopeBadge, TypeBadge } from "../components/McpBadges";

/**
 * Mask a sensitive value, keeping the first 4 and last 4 characters. Values
 * of 8 characters or fewer are fully masked. Exported for unit testing.
 */
export function maskSensitiveValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export interface DetailViewProps {
  server: McpServer;
  onBack: () => void;
  onOpenConfig: (server: McpServer) => void;
  onToggle: (server: McpServer) => void;
  onDelete: (server: McpServer) => void;
  onCopyName: (name: string) => void;
  onOpenClaude: () => void;
}

export function DetailView(props: DetailViewProps) {
  const { server, onBack, onOpenConfig, onToggle, onDelete, onCopyName, onOpenClaude } = props;
  const [copied, setCopied] = useState(false);
  const isPlugin = server.scope === "plugin";
  const envEntries = server.env ? Object.entries(server.env) : [];

  return (
    <div class="panel">
      <button type="button" class="back-btn" onClick={onBack}>
        <Icon name="arrow-left" /> Back
      </button>

      <div class="mcp-detail-head">
        <div class="mcp-detail-title">{server.name}</div>
        <TypeBadge type={server.type} />
        <ScopeBadge scope={server.scope} />
      </div>

      <div class="d-actions">
        {!isPlugin ? (
          <button type="button" class="btn primary" onClick={() => onToggle(server)}>
            <Icon name={server.disabled ? "play" : "x"} />{" "}
            {server.disabled ? "Enable" : "Disable"}
          </button>
        ) : null}
        <button type="button" class="btn" onClick={onOpenClaude}>
          <Icon name="play" /> Open Claude
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => {
            onCopyName(server.name);
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          }}
        >
          <Icon name="copy" /> {copied ? "Copied!" : "Copy Name"}
        </button>
        {!isPlugin ? (
          <button type="button" class="btn" onClick={() => onOpenConfig(server)}>
            <Icon name="external-link" /> Open Config
          </button>
        ) : null}
        {!isPlugin ? (
          <button type="button" class="btn del" onClick={() => onDelete(server)}>
            <Icon name="trash-2" /> Delete
          </button>
        ) : (
          <span class="mcp-readonly-note">
            Owned by plugin {server.pluginName ?? ""} — managed by Claude Code's{" "}
            <code>/plugin</code> command.
          </span>
        )}
      </div>

      <div class="mcp-detail-section">
        <div class="mcp-detail-label">Connection</div>
        {server.type === "http" ? (
          <div class="mcp-detail-kv">
            <span class="mcp-detail-k">URL</span>
            <span class="mcp-detail-v mono">{server.url ?? ""}</span>
          </div>
        ) : (
          <>
            <div class="mcp-detail-kv">
              <span class="mcp-detail-k">Command</span>
              <span class="mcp-detail-v mono">{server.command ?? ""}</span>
            </div>
            {server.args && server.args.length > 0 ? (
              <div class="mcp-detail-kv">
                <span class="mcp-detail-k">Args</span>
                <span class="mcp-detail-v mono">{server.args.join(" ")}</span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {envEntries.length > 0 ? (
        <div class="mcp-detail-section">
          <div class="mcp-detail-label">Environment Variables</div>
          {envEntries.map(([key, value]) => (
            <div class="mcp-env-row" key={key}>
              <span class="mcp-env-key">{key}</span>
              <span class="mcp-env-value">{maskSensitiveValue(value)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
