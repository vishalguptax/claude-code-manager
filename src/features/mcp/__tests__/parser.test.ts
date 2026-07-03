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

import {
  parseMcpServers,
  setProjectMcpServerDisabled,
  deleteMcpServer,
  readMcpAuthNeeds,
  addMcpServer,
  updateMcpServer,
  commandExistsOnPath,
} from "../parser";
import type { McpServerInput } from "../../../shared/protocol/messages";

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
  it("returns no servers when nothing is configured", () => {
    expect(parseMcpServers().servers).toEqual([]);
  });

  it("reads project + global MCP servers", () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { local: { command: "node", args: ["server.js"] } },
    });
    writeJson(path.join(HOME, ".claude", "mcp.json"), {
      mcpServers: { remote: { url: "https://example.com/mcp" } },
    });
    const servers = parseMcpServers(ws).servers;
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

    const servers = parseMcpServers().servers;
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

    const servers = parseMcpServers().servers;
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

    const servers = parseMcpServers().servers.filter((s) => s.name === "srv");
    expect(servers).toHaveLength(1);
    expect(servers[0].command).toBe("from-inline");
  });
});

describe("transport type derivation", () => {
  const ws = path.join(HOME, "ws");

  it("honors an explicit type over the command/url heuristic", () => {
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: {
        // Both command and url present — explicit type must win over
        // the "!command && url" heuristic, which would otherwise guess
        // stdio here since command is set.
        weird: { type: "http", command: "node", url: "https://example.com/mcp" },
      },
    });
    const servers = parseMcpServers(ws).servers;
    expect(servers.find((s) => s.name === "weird")?.type).toBe("http");
  });

  it("normalizes streamable-http to http", () => {
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { srv: { type: "streamable-http", url: "https://example.com/mcp" } },
    });
    expect(parseMcpServers(ws).servers.find((s) => s.name === "srv")?.type).toBe("http");
  });

  it("passes through sse and ws unchanged", () => {
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: {
        legacy: { type: "sse", url: "https://example.com/sse" },
        socket: { type: "ws", url: "wss://example.com/ws" },
      },
    });
    const servers = parseMcpServers(ws).servers;
    expect(servers.find((s) => s.name === "legacy")?.type).toBe("sse");
    expect(servers.find((s) => s.name === "socket")?.type).toBe("ws");
  });

  it("falls back to the command/url heuristic when type is absent or unrecognized", () => {
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: {
        stdioSrv: { command: "node" },
        urlOnly: { url: "https://example.com/mcp" },
        unknownType: { type: "carrier-pigeon", command: "node" },
      },
    });
    const servers = parseMcpServers(ws).servers;
    expect(servers.find((s) => s.name === "stdioSrv")?.type).toBe("stdio");
    expect(servers.find((s) => s.name === "urlOnly")?.type).toBe("http");
    expect(servers.find((s) => s.name === "unknownType")?.type).toBe("stdio");
  });
});

describe("headers parsing", () => {
  it("parses a string-valued headers object", () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: {
        api: {
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer token", "X-Custom": "value" },
        },
      },
    });
    const server = parseMcpServers(ws).servers.find((s) => s.name === "api");
    expect(server?.headers).toEqual({ Authorization: "Bearer token", "X-Custom": "value" });
  });

  it("drops non-string header values and omits headers entirely when empty", () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: {
        withNumeric: { command: "node", headers: { count: 5, ok: "yes" } },
        withNoStrings: { command: "node", headers: { count: 5 } },
      },
    });
    const servers = parseMcpServers(ws).servers;
    expect(servers.find((s) => s.name === "withNumeric")?.headers).toEqual({ ok: "yes" });
    expect(servers.find((s) => s.name === "withNoStrings")?.headers).toBeUndefined();
  });
});

describe("project server enable/disable via settings arrays", () => {
  const ws = path.join(HOME, "ws");
  const localSettings = path.join(ws, ".claude", "settings.local.json");
  const projectSettings = path.join(ws, ".claude", "settings.json");

  function readLocal(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(localSettings, "utf-8"));
  }

  it("disable writes the name to disabledMcpjsonServers in settings.local.json", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    expect(setProjectMcpServerDisabled("srv", true, ws)).toBe(true);
    expect(readLocal().disabledMcpjsonServers).toEqual(["srv"]);
  });

  it("does not touch .mcp.json when toggling", () => {
    const mcpFile = path.join(ws, ".mcp.json");
    writeJson(mcpFile, { mcpServers: { srv: { command: "node" } } });
    const before = fs.readFileSync(mcpFile, "utf-8");
    setProjectMcpServerDisabled("srv", true, ws);
    expect(fs.readFileSync(mcpFile, "utf-8")).toBe(before);
  });

  it("parseMcpServers reflects the disabled state from the settings array", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(localSettings, { disabledMcpjsonServers: ["srv"] });
    const server = parseMcpServers(ws).servers.find((s) => s.name === "srv");
    expect(server?.disabled).toBe(true);
  });

  it("a local enabled entry overrides a project-scope disabled entry (precedence)", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(projectSettings, { disabledMcpjsonServers: ["srv"] });
    writeJson(localSettings, { enabledMcpjsonServers: ["srv"] });
    const server = parseMcpServers(ws).servers.find((s) => s.name === "srv");
    expect(server?.disabled).toBeUndefined();
  });

  it("re-enabling clears the local disabled array key when it becomes empty", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    setProjectMcpServerDisabled("srv", true, ws);
    setProjectMcpServerDisabled("srv", false, ws);
    expect(readLocal().disabledMcpjsonServers).toBeUndefined();
  });

  it("re-enabling records a local override when a broader scope still disables the name", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(projectSettings, { disabledMcpjsonServers: ["srv"] });
    setProjectMcpServerDisabled("srv", false, ws);
    expect(readLocal().enabledMcpjsonServers).toEqual(["srv"]);
  });

  it("preserves unrelated settings keys when toggling", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(localSettings, { permissions: { allow: ["Bash"] } });
    setProjectMcpServerDisabled("srv", true, ws);
    expect(readLocal().permissions).toEqual({ allow: ["Bash"] });
  });

  it("strips the legacy per-entry disabled key from .mcp.json on toggle", () => {
    const mcpFile = path.join(ws, ".mcp.json");
    writeJson(mcpFile, { mcpServers: { srv: { command: "node", disabled: true } } });
    setProjectMcpServerDisabled("srv", true, ws);
    const config = JSON.parse(fs.readFileSync(mcpFile, "utf-8"));
    expect("disabled" in config.mcpServers.srv).toBe(false);
  });

  it("ignores a stale per-entry disabled key when computing disabled state", () => {
    // The legacy key was never honored by Claude Code — a server carrying it
    // (but not named in any disabledMcpjsonServers array) reads as enabled.
    writeJson(path.join(ws, ".mcp.json"), {
      mcpServers: { srv: { command: "node", disabled: true } },
    });
    const server = parseMcpServers(ws).servers.find((s) => s.name === "srv");
    expect(server?.disabled).toBeUndefined();
  });
});

describe("parse error surfacing", () => {
  it("reports a malformed project .mcp.json instead of throwing", () => {
    const ws = path.join(HOME, "ws");
    fs.mkdirSync(ws, { recursive: true });
    fs.writeFileSync(path.join(ws, ".mcp.json"), "{ not valid json");
    const result = parseMcpServers(ws);
    expect(result.servers).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(".mcp.json");
  });

  it("returns no errors when configs parse cleanly", () => {
    const ws = path.join(HOME, "ws");
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    expect(parseMcpServers(ws).errors).toEqual([]);
  });
});

describe("delete rejects plugin scope", () => {
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

describe("addMcpServer / updateMcpServer", () => {
  const ws = path.join(HOME, "ws");

  function input(overrides: Partial<McpServerInput> = {}): McpServerInput {
    return {
      name: "srv",
      scope: "project",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: {},
      headers: {},
      ...overrides,
    };
  }

  function readMcp(): Record<string, Record<string, unknown>> {
    return JSON.parse(fs.readFileSync(path.join(ws, ".mcp.json"), "utf-8")).mcpServers;
  }

  it("adds a stdio server, creating .mcp.json if absent", () => {
    expect(addMcpServer(input(), ws).ok).toBe(true);
    expect(readMcp().srv).toEqual({ command: "node", args: ["server.js"] });
  });

  it("adds an http server with url + headers, recording the transport type", () => {
    addMcpServer(
      input({ name: "api", transport: "http", command: undefined, args: undefined, url: "https://x", headers: { Authorization: "Bearer t" } }),
      ws,
    );
    expect(readMcp().api).toEqual({ type: "http", url: "https://x", headers: { Authorization: "Bearer t" } });
  });

  it("rejects a duplicate name on add", () => {
    addMcpServer(input(), ws);
    const r = addMcpServer(input(), ws);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/);
  });

  it("preserves sibling servers when adding", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { other: { command: "x" } } });
    addMcpServer(input(), ws);
    expect(Object.keys(readMcp()).sort()).toEqual(["other", "srv"]);
  });

  it("updates a server in place", () => {
    addMcpServer(input(), ws);
    expect(updateMcpServer("srv", input({ command: "deno" }), ws).ok).toBe(true);
    expect(readMcp().srv.command).toBe("deno");
  });

  it("supports renaming on update", () => {
    addMcpServer(input(), ws);
    expect(updateMcpServer("srv", input({ name: "renamed" }), ws).ok).toBe(true);
    expect(readMcp().srv).toBeUndefined();
    expect(readMcp().renamed).toBeDefined();
  });

  it("fails to update a server that no longer exists", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: {} });
    expect(updateMcpServer("ghost", input(), ws).ok).toBe(false);
  });

  it("refuses add/update on project scope without a workspace", () => {
    expect(addMcpServer(input(), undefined).ok).toBe(false);
    expect(updateMcpServer("srv", input(), undefined).ok).toBe(false);
  });
});

describe("commandExistsOnPath", () => {
  it("finds a command that exists in a PATH directory", () => {
    const dir = path.join(HOME, "bin");
    const exe = process.platform === "win32" ? "mytool.exe" : "mytool";
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, exe), "#!/bin/sh\n");
    const savedPath = process.env.PATH;
    process.env.PATH = dir + path.delimiter + (savedPath ?? "");
    try {
      expect(commandExistsOnPath("mytool")).toBe(true);
      expect(commandExistsOnPath("definitely-not-a-real-command-xyz")).toBe(false);
    } finally {
      process.env.PATH = savedPath;
    }
  });
});
