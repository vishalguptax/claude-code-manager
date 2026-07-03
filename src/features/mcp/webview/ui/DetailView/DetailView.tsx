/**
 * Detail view for a single MCP server. Shows the connection (command/args or
 * URL), env vars + headers (secrets masked, with a reveal toggle), a local
 * health dot for stdio servers, and scope-aware actions. Edit/toggle/delete
 * are hidden for read-only plugin servers. "Back" clears the selection.
 */
import { useState } from "preact/hooks";
import { Button, Icon } from "../../../../../webview/shared/ui";
import { isUrlTransport, maskSensitiveValue } from "../../lib";
import type { McpServer } from "../../../types";
import { ScopeBadge, TypeBadge } from "../McpBadges";

export interface DetailViewProps {
  server: McpServer;
  onBack: () => void;
  onEdit: (server: McpServer) => void;
  onOpenConfig: (server: McpServer) => void;
  onToggle: (server: McpServer) => void;
  onDelete: (server: McpServer) => void;
  onCopyName: (name: string) => void;
  onOpenClaude: () => void;
  onAuthenticate: (name: string) => void;
  onLogout: (name: string) => void;
  onReconnect: () => void;
  onCheckStatus: () => void;
}

/** A masked key/value row that reveals its value when `revealed`. */
function SecretRow({ k, value, revealed }: { k: string; value: string; revealed: boolean }) {
  return (
    <div class="mcp-env-row">
      <span class="mcp-env-key">{k}</span>
      <span class="mcp-env-value">{revealed ? value : maskSensitiveValue(value)}</span>
    </div>
  );
}

export function DetailView(props: DetailViewProps) {
  const {
    server,
    onBack,
    onEdit,
    onOpenConfig,
    onToggle,
    onDelete,
    onCopyName,
    onOpenClaude,
    onAuthenticate,
    onLogout,
    onReconnect,
    onCheckStatus,
  } = props;
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isPlugin = server.scope === "plugin";
  // Only project .mcp.json servers can be enabled/disabled — Claude
  // Code's toggle mechanism (the disabledMcpjsonServers arrays) governs
  // project servers only. Global/plugin servers have no such switch.
  const canToggle = server.scope === "project";
  const isUrl = isUrlTransport(server);
  const envEntries = server.env ? Object.entries(server.env) : [];
  const headerEntries = server.headers ? Object.entries(server.headers) : [];
  const hasSecrets = envEntries.length > 0 || headerEntries.length > 0;

  return (
    <div class="panel">
      <Button variant="secondary" class="back-btn" iconName="arrow-left" onClick={onBack}>
        Back
      </Button>

      <div class="mcp-detail-head">
        {server.commandAvailable !== undefined ? (
          <span
            class={`mcp-health-dot ${server.commandAvailable ? "is-ok" : "is-missing"}`}
            title={
              server.commandAvailable
                ? "Command found on PATH"
                : `Command "${server.command}" was not found on PATH`
            }
          />
        ) : null}
        <div class="mcp-detail-title">{server.name}</div>
        <TypeBadge type={server.type} />
        <ScopeBadge scope={server.scope} />
      </div>

      <div class="d-actions">
        {!isPlugin ? (
          <Button variant="primary" iconName="pencil" onClick={() => onEdit(server)}>
            Edit
          </Button>
        ) : null}
        {canToggle ? (
          <Button iconName={server.disabled ? "play" : "x"} onClick={() => onToggle(server)}>
            {server.disabled ? "Enable" : "Disable"}
          </Button>
        ) : null}
        {!isPlugin ? (
          <Button iconName="key-round" onClick={() => onAuthenticate(server.name)}>
            Authenticate
          </Button>
        ) : null}
        {!isPlugin ? (
          <Button iconName="log-out" onClick={() => onLogout(server.name)}>
            Clear Auth
          </Button>
        ) : null}
        <Button iconName="refresh-cw" onClick={onReconnect} title="Open the /mcp panel to reconnect">
          Reconnect
        </Button>
        {isUrl ? (
          <Button iconName="activity" onClick={onCheckStatus} title="Run `claude mcp list`">
            Check Status
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

      {server.scope === "global" ? (
        <div class="mcp-readonly-note mcp-global-note">
          User-scope servers can't be enabled/disabled by Claude Code — remove the
          entry from <code>~/.claude.json</code> to stop using it.
        </div>
      ) : null}

      <div class="mcp-detail-section">
        <div class="mcp-detail-label">Connection</div>
        {isUrl ? (
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

      {hasSecrets ? (
        <div class="mcp-secret-toggle">
          <Button
            variant="icon"
            iconName={revealed ? "eye-off" : "eye"}
            title={revealed ? "Hide values" : "Reveal values"}
            ariaLabel={revealed ? "Hide secret values" : "Reveal secret values"}
            onClick={() => setRevealed((r) => !r)}
          />
          <span class="mcp-secret-toggle-label">{revealed ? "Hide values" : "Reveal values"}</span>
        </div>
      ) : null}

      {envEntries.length > 0 ? (
        <div class="mcp-detail-section">
          <div class="mcp-detail-label">Environment Variables</div>
          {envEntries.map(([key, value]) => (
            <SecretRow key={key} k={key} value={value} revealed={revealed} />
          ))}
        </div>
      ) : null}

      {headerEntries.length > 0 ? (
        <div class="mcp-detail-section">
          <div class="mcp-detail-label">Headers</div>
          {headerEntries.map(([key, value]) => (
            <SecretRow key={key} k={key} value={value} revealed={revealed} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
