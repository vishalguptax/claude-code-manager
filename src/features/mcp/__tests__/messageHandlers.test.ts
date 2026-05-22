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
}

function harness(workspace?: string, withWebview = true): Harness {
  const posted: unknown[] = [];
  const cached: McpServer[][] = [];
  const wv = withWebview
    ? ({ postMessage: (m: unknown) => posted.push(m) } as unknown as vscode.Webview)
    : undefined;
  const ctx: McpHostContext = {
    getWebview: () => wv,
    getWorkspace: () => workspace,
    setMcpServers: (servers) => cached.push(servers),
  };
  return { ctx, posted, cached };
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
  it("opens the global config for global scope", async () => {
    const open = vi.fn().mockResolvedValue({});
    const show = vi.fn().mockResolvedValue(undefined);
    (vscode.workspace as unknown as { openTextDocument: unknown }).openTextDocument = open;
    (vscode.window as unknown as { showTextDocument: unknown }).showTextDocument = show;
    const { ctx } = harness();
    await handleMcpMessage({ type: "openMcpConfig", scope: "global" }, ctx);
    expect(open).toHaveBeenCalledWith(path.join(HOME, ".claude", "mcp.json"));
    expect(show).toHaveBeenCalled();
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
  it("toggles a real server and re-pushes the list", async () => {
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
    const written = JSON.parse(fs.readFileSync(path.join(ws, ".mcp.json"), "utf-8"));
    expect(written.mcpServers.local.disabled).toBe(true);
    expect(posted.at(-1)).toMatchObject({ type: "mcpServers" });
  });

  it("refuses plugin scope", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness();
    await handleMcpMessage(
      { type: "toggleMcpServer", name: "p", scope: "plugin", disabled: true },
      ctx,
    );
    expect(err).toHaveBeenCalled();
  });

  it("reports failure when the server is not found", async () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: {} });
    const err = vi.spyOn(vscode.window, "showErrorMessage");
    const { ctx } = harness(ws);
    await handleMcpMessage(
      { type: "toggleMcpServer", name: "missing", scope: "project", disabled: true },
      ctx,
    );
    expect(err).toHaveBeenCalled();
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
