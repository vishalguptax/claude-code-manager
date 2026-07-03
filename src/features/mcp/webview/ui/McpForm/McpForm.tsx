/**
 * Create/edit form for an MCP server, rendered in the shared <Modal>.
 * Emits an `McpServerInput` on save; the parent posts addMcpServer /
 * updateMcpServer. Fields adapt to the chosen transport: stdio shows
 * command + args, url transports (http/sse/ws) show a URL. env and
 * headers are entered as `KEY=value` lines and parsed on save.
 */
import { useState } from "preact/hooks";
import { Button, Dropdown, Modal, TextArea, TextField } from "../../../../../webview/shared/ui";
import type { McpServerInput } from "../../../../../shared/protocol/messages";
import type { McpServer } from "../../../types";

export interface McpFormProps {
  /** The server being edited, or null to add a new one. */
  server: McpServer | null;
  onClose: () => void;
  onSubmit: (originalName: string | null, input: McpServerInput) => void;
}

/** Render a KEY=value record as one `KEY=value` line each. */
function recordToLines(record: Record<string, string> | undefined): string {
  if (!record) return "";
  return Object.entries(record)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** Parse `KEY=value` lines into a record; blank lines and bad rows are skipped. */
function linesToRecord(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export function McpForm({ server, onClose, onSubmit }: McpFormProps) {
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
  const nameValid = name.trim().length > 0;
  const connValid = isStdio ? command.trim().length > 0 : url.trim().length > 0;
  const canSave = nameValid && connValid;

  const submit = (): void => {
    if (!canSave) return;
    const input: McpServerInput = {
      name: name.trim(),
      scope: isEdit ? (server as McpServer).scope : scope,
      transport,
      command: isStdio ? command.trim() : undefined,
      args: isStdio ? args.split(/\s+/).filter(Boolean) : undefined,
      url: isStdio ? undefined : url.trim(),
      env: linesToRecord(env),
      headers: linesToRecord(headers),
    };
    onSubmit(isEdit ? (server as McpServer).name : null, input);
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? "Edit MCP server" : "Add MCP server"}>
      <div class="mcp-form">
        <label class="mcp-form-field">
          <span class="mcp-form-label">Name</span>
          <TextField value={name} onInput={setName} placeholder="my-server" ariaLabel="Server name" />
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
        </label>

        <label class="mcp-form-field">
          <span class="mcp-form-label">Headers</span>
          <TextArea
            value={headers}
            onInput={setHeaders}
            rows={2}
            placeholder={"Authorization=Bearer token"}
            ariaLabel="Headers"
          />
        </label>

        <div class="mcp-form-actions">
          <Button variant="primary" iconName="check" disabled={!canSave} onClick={submit}>
            {isEdit ? "Save" : "Add"}
          </Button>
          <Button iconName="x" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
