import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-mcp-home") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import { parseMcpServers, toggleMcpServer, deleteMcpServer, readMcpAuthNeeds } from "../parser";

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});
afterEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe("parseMcpServers", () => {
  it("returns [] when nothing is configured", () => {
    expect(parseMcpServers()).toEqual([]);
  });

  it("reads project + global MCP servers", () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { local: { command: "node", args: ["server.js"] } },
    });
    writeJson(path.join(HOME, ".claude", "mcp.json"), {
      mcpServers: { remote: { url: "https://example.com/mcp" } },
    });
    const servers = parseMcpServers(ws);
    expect(servers.find((s) => s.name === "local")?.scope).toBe("project");
    expect(servers.find((s) => s.name === "remote")?.scope).toBe("global");
    expect(servers.find((s) => s.name === "remote")?.type).toBe("http");
  });

  it("surfaces plugin-supplied inline mcpServers as scope: plugin", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "p", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), {
      mcpServers: { docs: { command: "docs-mcp" } },
    });
    writeJson(path.join(HOME, ".claude", "plugins", "installed_plugins.json"), {
      plugins: { "p@mkt": [{ scope: "user", installPath: pluginRoot }] },
    });

    const servers = parseMcpServers();
    const docs = servers.find((s) => s.name === "docs");
    expect(docs?.scope).toBe("plugin");
    expect(docs?.pluginName).toBe("p@mkt");
  });

  it("reads .mcp.json from the plugin root when manifest has no inline block", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "f", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), {});
    writeJson(path.join(pluginRoot, ".mcp.json"), {
      mcpServers: { fs: { command: "fs-mcp" } },
    });
    writeJson(path.join(HOME, ".claude", "plugins", "installed_plugins.json"), {
      plugins: { "f@mkt": [{ scope: "user", installPath: pluginRoot }] },
    });

    const servers = parseMcpServers();
    expect(servers.find((s) => s.name === "fs" && s.scope === "plugin")).toBeDefined();
  });

  it("prefers inline mcpServers over a sibling .mcp.json to avoid duplicates", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "d", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), {
      mcpServers: { srv: { command: "from-inline" } },
    });
    writeJson(path.join(pluginRoot, ".mcp.json"), {
      mcpServers: { srv: { command: "from-file" } },
    });
    writeJson(path.join(HOME, ".claude", "plugins", "installed_plugins.json"), {
      plugins: { "d@mkt": [{ scope: "user", installPath: pluginRoot }] },
    });

    const servers = parseMcpServers().filter((s) => s.name === "srv");
    expect(servers).toHaveLength(1);
    expect(servers[0].command).toBe("from-inline");
  });
});

describe("toggle/delete reject plugin scope", () => {
  it("toggleMcpServer returns false for plugin scope and writes nothing", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "g", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    writeJson(path.join(pluginRoot, ".claude-plugin", "plugin.json"), {
      mcpServers: { docs: { command: "docs-mcp" } },
    });
    const manifestBefore = fs.readFileSync(
      path.join(pluginRoot, ".claude-plugin", "plugin.json"),
      "utf-8",
    );

    expect(toggleMcpServer("docs", "plugin", true)).toBe(false);

    const manifestAfter = fs.readFileSync(
      path.join(pluginRoot, ".claude-plugin", "plugin.json"),
      "utf-8",
    );
    expect(manifestAfter).toBe(manifestBefore);
  });

  it("deleteMcpServer returns false for plugin scope", () => {
    expect(deleteMcpServer("docs", "plugin")).toBe(false);
  });
});

describe("readMcpAuthNeeds", () => {
  const authCachePath = path.join(HOME, ".claude", "mcp-needs-auth-cache.json");

  it("returns [] when the cache file is missing", () => {
    expect(readMcpAuthNeeds()).toEqual([]);
  });

  it("returns sorted server names from the cache keys", () => {
    writeJson(authCachePath, {
      "claude.ai Google Drive": { timestamp: 1, id: "x" },
      "claude.ai Gmail": { timestamp: 2, id: "y" },
      "claude.ai Google Calendar": { timestamp: 3, id: "z" },
    });
    expect(readMcpAuthNeeds()).toEqual([
      "claude.ai Gmail",
      "claude.ai Google Calendar",
      "claude.ai Google Drive",
    ]);
  });

  it("returns [] for an array (not an object)", () => {
    writeJson(authCachePath, ["nope"]);
    expect(readMcpAuthNeeds()).toEqual([]);
  });

  it("returns [] for invalid JSON", () => {
    fs.mkdirSync(path.dirname(authCachePath), { recursive: true });
    fs.writeFileSync(authCachePath, "{ not json");
    expect(readMcpAuthNeeds()).toEqual([]);
  });
});
