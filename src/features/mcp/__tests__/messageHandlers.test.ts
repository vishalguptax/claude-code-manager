import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-mcp-handlers") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import { handleMcpMessage, type McpHostContext } from "../messageHandlers";
import type { McpServer } from "../types";

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

interface Harness {
  ctx: McpHostContext;
  posted: unknown[];
  cached: McpServer[][];
  shell: Array<{ label: string; command: string }>;
  slash: Array<{ label: string; slash: string }>;
}

function harness(workspace?: string, withWebview = true): Harness {
  const posted: unknown[] = [];
  const cached: McpServer[][] = [];
  const shell: Array<{ label: string; command: string }> = [];
  const slash: Array<{ label: string; slash: string }> = [];
  const wv = withWebview
    ? ({ postMessage: (m: unknown) => posted.push(m) } as unknown as vscode.Webview)
    : undefined;
  const ctx: McpHostContext = {
    getWebview: () => wv,
    getWorkspace: () => workspace,
    setMcpServers: (servers) => cached.push(servers),
    runShellCommand: (label, command) => shell.push({ label, command }),
    runSlashCommand: (label, s) => slash.push({ label, slash: s }),
  };
  return { ctx, posted, cached, shell, slash };
}

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
  vi.restoreAllMocks();
});
afterEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("handleMcpMessage — routing", () => {
  it("ignores non-MCP messages", async () => {
    const { ctx } = harness();
    expect(await handleMcpMessage({ type: "getSkills" }, ctx)).toBe(false);
  });

  it("claims and rejects a malformed MCP message without acting", async () => {
    const { ctx, posted } = harness();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    // Missing required `scope` for openMcpConfig.
    expect(await handleMcpMessage({ type: "openMcpConfig" }, ctx)).toBe(true);
    expect(posted).toHaveLength(0);
    expect(err).toHaveBeenCalled();
  });

  it("defers a totally unknown shape", async () => {
    const { ctx } = harness();
    expect(await handleMcpMessage({ foo: "bar" }, ctx)).toBe(false);
  });
});

describe("getMcpServers", () => {
  it("parses, caches, and posts the server list", async () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { local: { command: "node" } },
    });
    const { ctx, posted, cached } = harness(ws);
    expect(await handleMcpMessage({ type: "getMcpServers" }, ctx)).toBe(true);
    expect(cached[0]?.[0]?.name).toBe("local");
    expect(posted[0]).toMatchObject({ type: "mcpServers" });
  });

  it("returns true but does nothing when no webview is resolved", async () => {
    const { ctx, posted } = harness(undefined, false);
    expect(await handleMcpMessage({ type: "getMcpServers" }, ctx)).toBe(true);
    expect(posted).toHaveLength(0);
  });
});

describe("openMcpConfig", () => {
  it("opens the canonical ~/.claude.json for global scope (not the legacy mcp.json)", async () => {
    // A real global server lives in ~/.claude.json — opening the legacy
    // ~/.claude/mcp.json (the old behaviour) would show a file that doesn't
    // contain it. With a name, we route to the file that owns that server.
    writeJson(path.join(HOME, ".claude.json"), { mcpServers: { srv: { command: "node" } } });
    const open = vi.fn().mockResolvedValue({});
    const show = vi.fn().mockResolvedValue(undefined);
    (vscode.workspace as unknown as { openTextDocument: unknown }).openTextDocument = open;
    (vscode.window as unknown as { showTextDocument: unknown }).showTextDocument = show;
    const { ctx } = harness();
    await handleMcpMessage({ type: "openMcpConfig", scope: "global", name: "srv" }, ctx);
    expect(open).toHaveBeenCalledWith(path.join(HOME, ".claude.json"));
    expect(show).toHaveBeenCalled();
  });

  it("opens the canonical global config when no server name is given", async () => {
    writeJson(path.join(HOME, ".claude.json"), { mcpServers: {} });
    const open = vi.fn().mockResolvedValue({});
    const show = vi.fn().mockResolvedValue(undefined);
    (vscode.workspace as unknown as { openTextDocument: unknown }).openTextDocument = open;
    (vscode.window as unknown as { showTextDocument: unknown }).showTextDocument = show;
    const { ctx } = harness();
    await handleMcpMessage({ type: "openMcpConfig", scope: "global" }, ctx);
    expect(open).toHaveBeenCalledWith(path.join(HOME, ".claude.json"));
  });

  it("errors when project scope has no workspace", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness(undefined);
    await handleMcpMessage({ type: "openMcpConfig", scope: "project" }, ctx);
    expect(err).toHaveBeenCalledWith("No workspace folder open");
  });

  it("rejects plugin scope with a guidance message", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleMcpMessage({ type: "openMcpConfig", scope: "plugin" }, ctx);
    expect(err).toHaveBeenCalled();
  });
});

describe("toggleMcpServer", () => {
  it("disables a project server by writing the settings.local.json array, then re-pushes", async () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { local: { command: "node" } },
    });
    const { ctx, posted } = harness(ws);
    const ok = await handleMcpMessage(
      { type: "toggleMcpServer", name: "local", scope: "project", disabled: true },
      ctx,
    );
    expect(ok).toBe(true);
    // The real mechanism: an array in settings.local.json, NOT a field on
    // the .mcp.json entry.
    const local = JSON.parse(
      fs.readFileSync(path.join(ws, ".claude", "settings.local.json"), "utf-8"),
    );
    expect(local.disabledMcpjsonServers).toEqual(["local"]);
    const mcp = JSON.parse(fs.readFileSync(path.join(ws, ".mcp.json"), "utf-8"));
    expect("disabled" in mcp.mcpServers.local).toBe(false);
    expect(posted.at(-1)).toMatchObject({ type: "mcpServers" });
  });

  it("rejects global scope — Claude Code can't disable user-scope servers", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness(path.join(HOME, "ws"));
    await handleMcpMessage(
      { type: "toggleMcpServer", name: "g", scope: "global", disabled: true },
      ctx,
    );
    expect(err).toHaveBeenCalled();
  });

  it("rejects plugin scope", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness(path.join(HOME, "ws"));
    await handleMcpMessage(
      { type: "toggleMcpServer", name: "p", scope: "plugin", disabled: true },
      ctx,
    );
    expect(err).toHaveBeenCalled();
  });

  it("errors when there is no workspace open", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness(undefined);
    await handleMcpMessage(
      { type: "toggleMcpServer", name: "local", scope: "project", disabled: true },
      ctx,
    );
    expect(err).toHaveBeenCalledWith("No workspace folder open");
  });
});

describe("deleteMcpServer", () => {
  it("deletes after the user confirms", async () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { local: { command: "node" } },
    });
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue("Delete" as never);
    const { ctx, posted } = harness(ws);
    await handleMcpMessage({ type: "deleteMcpServer", name: "local", scope: "project" }, ctx);
    const written = JSON.parse(fs.readFileSync(path.join(ws, ".mcp.json"), "utf-8"));
    expect(written.mcpServers.local).toBeUndefined();
    expect(posted.at(-1)).toMatchObject({ type: "mcpServers" });
  });

  it("does nothing when the user cancels", async () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { local: { command: "node" } },
    });
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined as never);
    const { ctx, posted } = harness(ws);
    await handleMcpMessage({ type: "deleteMcpServer", name: "local", scope: "project" }, ctx);
    const written = JSON.parse(fs.readFileSync(path.join(ws, ".mcp.json"), "utf-8"));
    expect(written.mcpServers.local).toBeDefined();
    expect(posted).toHaveLength(0);
  });

  it("refuses plugin scope", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleMcpMessage({ type: "deleteMcpServer", name: "p", scope: "plugin" }, ctx);
    expect(err).toHaveBeenCalled();
  });
});

describe("addMcpServer / updateMcpServer", () => {
  it("adds a server to project .mcp.json and re-pushes", async () => {
    const ws = path.join(HOME, "ws");
    fs.mkdirSync(ws, { recursive: true });
    const { ctx, posted } = harness(ws);
    const server = { name: "api", scope: "project", transport: "http", url: "https://x/mcp" };
    await handleMcpMessage({ type: "addMcpServer", server }, ctx);
    const written = JSON.parse(fs.readFileSync(path.join(ws, ".mcp.json"), "utf-8"));
    expect(written.mcpServers.api).toEqual({ type: "http", url: "https://x/mcp" });
    expect(posted.at(-1)).toMatchObject({ type: "mcpServers" });
  });

  it("surfaces a duplicate-name failure on add", async () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { api: { command: "x" } } });
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness(ws);
    await handleMcpMessage(
      { type: "addMcpServer", server: { name: "api", scope: "project", transport: "stdio", command: "y" } },
      ctx,
    );
    expect(err).toHaveBeenCalled();
  });

  it("updates a server, keyed by originalName", async () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { api: { command: "old" } } });
    const { ctx } = harness(ws);
    await handleMcpMessage(
      {
        type: "updateMcpServer",
        originalName: "api",
        server: { name: "api", scope: "project", transport: "stdio", command: "new" },
      },
      ctx,
    );
    const written = JSON.parse(fs.readFileSync(path.join(ws, ".mcp.json"), "utf-8"));
    expect(written.mcpServers.api.command).toBe("new");
  });
});

describe("custom actions (terminal launches)", () => {
  it("authenticate runs `claude mcp login <name>`", async () => {
    const { ctx, shell } = harness();
    await handleMcpMessage({ type: "authenticateMcp", name: "api" }, ctx);
    expect(shell[0].command).toBe("claude mcp login 'api'");
  });

  it("logout runs `claude mcp logout <name>`", async () => {
    const { ctx, shell } = harness();
    await handleMcpMessage({ type: "logoutMcp", name: "api" }, ctx);
    expect(shell[0].command).toBe("claude mcp logout 'api'");
  });

  it("reconnect opens the /mcp slash panel", async () => {
    const { ctx, slash } = harness();
    await handleMcpMessage({ type: "reconnectMcp" }, ctx);
    expect(slash[0].slash).toBe("/mcp");
  });

  it("mcpListStatus runs `claude mcp list`", async () => {
    const { ctx, shell } = harness();
    await handleMcpMessage({ type: "mcpListStatus" }, ctx);
    expect(shell[0].command).toBe("claude mcp list");
  });

  it("shell-escapes a server name with a single quote", async () => {
    const { ctx, shell } = harness();
    await handleMcpMessage({ type: "authenticateMcp", name: "a'b" }, ctx);
    // POSIX close-quote, escaped literal quote, reopen: a'b -> 'a'\''b'
    const escaped = ["'a'", "\\'", "'b'"].join("");
    expect(shell[0].command).toBe(`claude mcp login ${escaped}`);
  });
});
