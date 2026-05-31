/**
 * Detail view for a single MCP server. Shows the connection (command/args or
 * URL), environment variables with sensitive values masked, and scope-aware
 * action buttons (toggle/open-config/delete are hidden for read-only plugin
 * servers). Selecting "Back" clears the selection signal.
 */
import { useState } from "preact/hooks";
import { Button } from "../../../../../webview/shared/ui";
import { maskSensitiveValue } from "../../lib";
import type { McpServer } from "../../../types";
import { ScopeBadge, TypeBadge } from "../McpBadges";

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
      <Button variant="secondary" class="back-btn" iconName="arrow-left" onClick={onBack}>
        Back
      </Button>

      <div class="mcp-detail-head">
        <div class="mcp-detail-title">{server.name}</div>
        <TypeBadge type={server.type} />
        <ScopeBadge scope={server.scope} />
      </div>

      <div class="d-actions">
        {!isPlugin ? (
          <Button
            variant="primary"
            iconName={server.disabled ? "play" : "x"}
            onClick={() => onToggle(server)}
          >
            {server.disabled ? "Enable" : "Disable"}
          </Button>
        ) : null}
        <Button iconName="play" onClick={onOpenClaude}>
          Open Claude
        </Button>
        <Button
          iconName="copy"
          onClick={() => {
            onCopyName(server.name);
            setCopied(true);
            setTimeout(() => setCopied(false), 1000);
          }}
        >
          {copied ? "Copied!" : "Copy Name"}
        </Button>
        {!isPlugin ? (
          <Button iconName="external-link" onClick={() => onOpenConfig(server)}>
            Open Config
          </Button>
        ) : null}
        {!isPlugin ? (
          <Button variant="danger" iconName="trash-2" onClick={() => onDelete(server)}>
            Delete
          </Button>
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
