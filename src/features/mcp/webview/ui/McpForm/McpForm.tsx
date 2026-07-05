/**
 * Create/edit form for an MCP server, rendered as a full inline panel
 * (not a modal — cramped in a narrow sidebar, and a popup stacks behind
 * its own backdrop). Emits an `McpServerInput` on save; the parent posts
 * addMcpServer / updateMcpServer. Fields adapt to the chosen transport:
 * stdio shows command + args, url transports (http/sse/ws) show a URL.
 * env and headers are entered as `KEY=value` lines and parsed on save.
 */
import { useState } from "preact/hooks";
import { BackButton, Button, Dropdown, TextArea, TextField } from "../../../../../webview/shared/ui";
import type { McpServerInput } from "../../../../../shared/protocol/messages";
import type { McpServer } from "../../../types";

export interface McpFormProps {
  /** The server being edited, or null to add a new one. */
  server: McpServer | null;
  /** Existing servers (name + scope) for duplicate-name validation. */
  existing?: Array<{ name: string; scope: string }>;
  onClose: () => void;
  onSubmit: (originalName: string | null, input: McpServerInput) => void;
}

/** Server name: start alphanumeric, then letters/digits/dot/underscore/hyphen. */
const MCP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Render a KEY=value record as one `KEY=value` line each. */
function recordToLines(record: Record<string, string> | undefined): string {
  if (!record) return "";
  return Object.entries(record)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/**
 * Parse `KEY=value` lines into a record, also collecting the 1-based line
 * numbers of any non-blank line that isn't `KEY=value` (no key before `=`)
 * so the form can flag them instead of silently dropping them.
 */
function parseKeyVals(text: string): { record: Record<string, string>; invalid: number[] } {
  const record: Record<string, string> = {};
  const invalid: number[] = [];
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      invalid.push(i + 1);
      return;
    }
    record[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  });
  return { record, invalid };
}

/** A url-transport URL must carry the right scheme (ws(s) for ws, else http(s)). */
function urlValidForTransport(url: string, transport: string): boolean {
  const u = url.trim();
  return transport === "ws" ? /^wss?:\/\/.+/i.test(u) : /^https?:\/\/.+/i.test(u);
}

export function McpForm({ server, existing = [], onClose, onSubmit }: McpFormProps) {
  const isEdit = server !== null;
  const [name, setName] = useState(server?.name ?? "");
  const [transport, setTransport] = useState(server?.type ?? "stdio");
  const [command, setCommand] = useState(server?.command ?? "");
  const [args, setArgs] = useState((server?.args ?? []).join(" "));
  const [url, setUrl] = useState(server?.url ?? "");
  const [env, setEnv] = useState(recordToLines(server?.env));
  const [headers, setHeaders] = useState(recordToLines(server?.headers));
  const [scope, setScope] = useState(server?.scope === "global" ? "global" : "project");

  const isStdio = transport === "stdio";
  const trimmedName = name.trim();
  const targetScope = isEdit ? (server as McpServer).scope : scope;

  // ── Validation ──
  const nameFormatValid = MCP_NAME_RE.test(trimmedName);
  const nameDup = existing.some(
    (e) =>
      e.scope === targetScope &&
      e.name === trimmedName &&
      !(isEdit && e.name === (server as McpServer).name && e.scope === (server as McpServer).scope),
  );
  const urlValid = urlValidForTransport(url, transport);
  const connValid = isStdio ? command.trim().length > 0 : urlValid;
  const envParsed = parseKeyVals(env);
  const headerParsed = parseKeyVals(headers);
  const envValid = envParsed.invalid.length === 0;
  const headersValid = isStdio || headerParsed.invalid.length === 0;

  const canSave =
    trimmedName.length > 0 && nameFormatValid && !nameDup && connValid && envValid && headersValid;

  const submit = (): void => {
    if (!canSave) return;
    const input: McpServerInput = {
      name: trimmedName,
      scope: targetScope,
      transport,
      command: isStdio ? command.trim() : undefined,
      args: isStdio ? args.split(/\s+/).filter(Boolean) : undefined,
      url: isStdio ? undefined : url.trim(),
      env: envParsed.record,
      // Headers only apply to url transports; never write them for stdio.
      headers: isStdio ? {} : headerParsed.record,
    };
    onSubmit(isEdit ? (server as McpServer).name : null, input);
  };

  return (
    <div class="panel">
      <BackButton onClick={onClose} />
      <div class="mcp-form-title">{isEdit ? "Edit MCP server" : "Add MCP server"}</div>
      <div class="mcp-form">
        <label class="mcp-form-field">
          <span class="mcp-form-label">Name</span>
          <TextField value={name} onInput={setName} placeholder="my-server" ariaLabel="Server name" />
          {trimmedName.length > 0 && !nameFormatValid ? (
            <span class="mcp-form-hint mcp-form-hint-error">
              Letters, digits, and . _ - only (must start alphanumeric).
            </span>
          ) : nameDup ? (
            <span class="mcp-form-hint mcp-form-hint-error">
              A server named "{trimmedName}" already exists in {targetScope} scope.
            </span>
          ) : null}
        </label>

        {!isEdit ? (
          <label class="mcp-form-field">
            <span class="mcp-form-label">Scope</span>
            <Dropdown
              value={scope}
              onChange={setScope}
              ariaLabel="Server scope"
              options={[
                { value: "project", label: "Project (.mcp.json)" },
                { value: "global", label: "Global (~/.claude.json)" },
              ]}
            />
          </label>
        ) : null}

        <label class="mcp-form-field">
          <span class="mcp-form-label">Transport</span>
          <Dropdown
            value={transport}
            onChange={(v) => setTransport(v as McpServer["type"])}
            ariaLabel="Transport"
            options={[
              { value: "stdio", label: "stdio (local command)" },
              { value: "http", label: "http" },
              { value: "sse", label: "sse (deprecated)" },
              { value: "ws", label: "ws" },
            ]}
          />
        </label>

        {isStdio ? (
          <>
            <label class="mcp-form-field">
              <span class="mcp-form-label">Command</span>
              <TextField
                value={command}
                onInput={setCommand}
                placeholder="npx"
                ariaLabel="Command"
              />
            </label>
            <label class="mcp-form-field">
              <span class="mcp-form-label">Args</span>
              <TextField
                value={args}
                onInput={setArgs}
                placeholder="-y @scope/server (space-separated)"
                ariaLabel="Args"
              />
            </label>
          </>
        ) : (
          <label class="mcp-form-field">
            <span class="mcp-form-label">URL</span>
            <TextField
              value={url}
              onInput={setUrl}
              placeholder="https://example.com/mcp"
              ariaLabel="URL"
            />
            {url.trim().length > 0 && !urlValid ? (
              <span class="mcp-form-hint mcp-form-hint-error">
                {transport === "ws"
                  ? "Must start with ws:// or wss://"
                  : "Must start with http:// or https://"}
              </span>
            ) : null}
          </label>
        )}

        <label class="mcp-form-field">
          <span class="mcp-form-label">Environment variables</span>
          <TextArea
            value={env}
            onInput={setEnv}
            rows={3}
            placeholder={"KEY=value\nANOTHER=value"}
            ariaLabel="Environment variables"
          />
          {!envValid ? (
            <span class="mcp-form-hint mcp-form-hint-error">
              Line{envParsed.invalid.length > 1 ? "s" : ""} {envParsed.invalid.join(", ")} must be
              KEY=value.
            </span>
          ) : null}
        </label>

        {/* Headers only apply to url transports (http/sse/ws) — hidden for stdio. */}
        {!isStdio ? (
          <label class="mcp-form-field">
            <span class="mcp-form-label">Headers</span>
            <TextArea
              value={headers}
              onInput={setHeaders}
              rows={2}
              placeholder={"Authorization=Bearer token"}
              ariaLabel="Headers"
            />
            {!headersValid ? (
              <span class="mcp-form-hint mcp-form-hint-error">
                Line{headerParsed.invalid.length > 1 ? "s" : ""} {headerParsed.invalid.join(", ")}{" "}
                must be Name=value.
              </span>
            ) : null}
          </label>
        ) : null}

        <div class="mcp-form-actions">
          <Button variant="primary" iconName="check" disabled={!canSave} onClick={submit}>
            {isEdit ? "Save" : "Add"}
          </Button>
          <Button iconName="x" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
