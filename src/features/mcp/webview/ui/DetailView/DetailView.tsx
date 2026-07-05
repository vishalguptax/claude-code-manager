/**
 * Detail view for a single MCP server. Shows the connection (command/args or
 * URL), env vars + headers (secrets masked, with a reveal toggle), a local
 * health dot for stdio servers, and scope-aware actions. Edit/toggle/delete
 * are hidden for read-only plugin servers. "Back" clears the selection.
 */
import { useRef, useState } from "preact/hooks";
import { BackButton, Button, Icon, Menu, type MenuItem } from "../../../../../webview/shared/ui";
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
  const [revealed, setRevealed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const moreRef = useRef<HTMLSpanElement>(null);

  const openMore = (e: MouseEvent): void => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchor({ x: r.left, y: r.bottom + 2 });
    setMenuOpen(true);
  };

  const isPlugin = server.scope === "plugin";
  // Only project .mcp.json servers can be enabled/disabled — Claude
  // Code's toggle mechanism (the disabledMcpjsonServers arrays) governs
  // project servers only. Global/plugin servers have no such switch.
  const canToggle = server.scope === "project";
  const isUrl = isUrlTransport(server);
  // Health dot is a LOCAL, offline check: does the stdio launch command resolve
  // on PATH? It is NOT a live connection/online status (url servers get no dot).
  // Spell that out so the green/red dot isn't read as "server is online".
  const healthTitle =
    server.commandAvailable === undefined
      ? undefined
      : server.commandAvailable
        ? "Launch command found on PATH — not a live connection status"
        : `Launch command "${server.command}" not found on PATH`;
  const envEntries = server.env ? Object.entries(server.env) : [];
  const headerEntries = server.headers ? Object.entries(server.headers) : [];
  const hasSecrets = envEntries.length > 0 || headerEntries.length > 0;

  // Occasional actions live in the "More" menu (auth/connection/utility).
  const moreItems: MenuItem[] = [];
  // Auth is OAuth (`claude mcp login/logout`) — a remote-transport concept.
  // stdio servers run a local command with no OAuth, so gate auth to url
  // transports, mirroring how "Check Status" is gated below.
  if (!isPlugin && isUrl) {
    moreItems.push({ label: "Authenticate", icon: "key-round", onSelect: () => onAuthenticate(server.name) });
    moreItems.push({ label: "Clear Auth", icon: "log-out", onSelect: () => onLogout(server.name) });
  }
  moreItems.push({ label: "Reconnect (/mcp)", icon: "refresh-cw", onSelect: onReconnect });
  if (isUrl) moreItems.push({ label: "Check Status", icon: "activity", onSelect: onCheckStatus });
  moreItems.push({ label: "Open Claude", icon: "play", onSelect: onOpenClaude });
  moreItems.push({ label: "Copy Name", icon: "copy", onSelect: () => onCopyName(server.name) });
  if (!isPlugin) {
    moreItems.push({ label: "Open Config", icon: "external-link", onSelect: () => onOpenConfig(server) });
  }

  return (
    <div class="panel">
      <BackButton onClick={onBack} />

      <div class="d-head d-head--row">
        {server.commandAvailable !== undefined ? (
          <span
            class={`mcp-health-dot ${server.commandAvailable ? "is-ok" : "is-missing"}`}
            role="img"
            aria-label={healthTitle}
            title={healthTitle}
          />
        ) : null}
        <div class="d-title">{server.name}</div>
        <TypeBadge type={server.type} />
        <ScopeBadge scope={server.scope} />
      </div>

      {/* Primary actions stay visible; occasional actions fold into "More" so
          the row doesn't become a wall of equal-weight buttons. */}
      <div class="mcp-detail-actions">
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
          <Button variant="danger" iconName="trash-2" onClick={() => onDelete(server)}>
            Delete
          </Button>
        ) : null}
        <span ref={moreRef} class="mcp-more-wrap">
          <Button iconName="more-horizontal" onClick={openMore} title="More actions">
            More
          </Button>
        </span>
      </div>

      {isPlugin ? (
        <div class="mcp-readonly-note">
          Owned by plugin {server.pluginName ?? ""} — managed by Claude Code's{" "}
          <code>/plugin</code> command.
        </div>
      ) : null}

      {server.scope === "global" ? (
        <div class="mcp-readonly-note mcp-global-note">
          User-scope servers can't be enabled/disabled by Claude Code — remove the
          entry from <code>~/.claude.json</code> to stop using it.
        </div>
      ) : null}

      <Menu
        open={menuOpen}
        x={anchor.x}
        y={anchor.y}
        items={moreItems}
        onClose={() => setMenuOpen(false)}
        anchorRef={moreRef}
      />

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
