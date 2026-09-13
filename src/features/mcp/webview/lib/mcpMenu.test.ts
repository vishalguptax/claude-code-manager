import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "../../types";
import {
  buildMcpMenu,
  canAuthMcp,
  canEditMcp,
  canToggleMcp,
  type McpMenuHandlers,
} from "./mcpMenu";

function server(over: Partial<McpServer> = {}): McpServer {
  return {
    name: "srv",
    scope: "project",
    type: "stdio",
    command: "npx",
    args: [],
    disabled: false,
    ...over,
  } as McpServer;
}

function handlers(): McpMenuHandlers {
  return {
    onEdit: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onCopyName: vi.fn(),
    onOpenConfig: vi.fn(),
    onAuthenticate: vi.fn(),
    onLogout: vi.fn(),
  };
}

const labels = (s: McpServer): string[] => buildMcpMenu(s, handlers()).map((i) => i.label);

describe("MCP capability rules", () => {
  it("refuses to edit a plugin-owned server", () => {
    expect(canEditMcp(server({ scope: "plugin" }))).toBe(false);
    expect(canEditMcp(server({ scope: "project" }))).toBe(true);
    expect(canEditMcp(server({ scope: "global" }))).toBe(true);
  });

  it("only toggles project servers", () => {
    // Claude Code's switch is the disabledMcpjsonServers arrays, and those
    // govern project .mcp.json servers alone.
    expect(canToggleMcp(server({ scope: "project" }))).toBe(true);
    expect(canToggleMcp(server({ scope: "global" }))).toBe(false);
    expect(canToggleMcp(server({ scope: "plugin" }))).toBe(false);
  });

  it("only offers auth for remote transports", () => {
    expect(canAuthMcp(server({ type: "http" }))).toBe(true);
    expect(canAuthMcp(server({ type: "sse" }))).toBe(true);
    expect(canAuthMcp(server({ type: "stdio" }))).toBe(false);
    expect(canAuthMcp(server({ type: "http", scope: "plugin" }))).toBe(false);
  });
});

describe("buildMcpMenu", () => {
  it("offers the full set for a project stdio server", () => {
    expect(labels(server())).toEqual([
      "Edit…",
      "Disable",
      "Copy Name",
      "Open Config",
      "Delete",
    ]);
  });

  it("says Enable for a server that is already disabled", () => {
    expect(labels(server({ disabled: true }))).toContain("Enable");
    expect(labels(server({ disabled: true }))).not.toContain("Disable");
  });

  it("drops the toggle for a global server", () => {
    const l = labels(server({ scope: "global" }));
    expect(l).not.toContain("Disable");
    expect(l).toContain("Edit…");
    expect(l).toContain("Delete");
  });

  it("leaves a plugin server read-only", () => {
    // Nothing here may rewrite what a plugin ships.
    expect(labels(server({ scope: "plugin" }))).toEqual(["Copy Name"]);
  });

  it("adds auth entries for a remote server", () => {
    const l = labels(server({ type: "http" }));
    expect(l).toContain("Authenticate");
    expect(l).toContain("Clear Auth");
  });

  it("wires each entry to its handler", () => {
    const h = handlers();
    const s = server({ type: "http" });
    for (const item of buildMcpMenu(s, h)) item.onSelect();
    expect(h.onEdit).toHaveBeenCalledWith(s);
    expect(h.onToggle).toHaveBeenCalledWith(s);
    expect(h.onDelete).toHaveBeenCalledWith(s);
    expect(h.onOpenConfig).toHaveBeenCalledWith(s);
    expect(h.onCopyName).toHaveBeenCalledWith("srv");
    expect(h.onAuthenticate).toHaveBeenCalledWith("srv");
    expect(h.onLogout).toHaveBeenCalledWith("srv");
  });

  it("marks Delete as the only destructive entry", () => {
    const items = buildMcpMenu(server(), handlers());
    expect(items.filter((i) => i.danger).map((i) => i.label)).toEqual(["Delete"]);
  });
});
