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
    expect(setProjectMcpServerDisabled("srv", true, ws)).toEqual({ ok: true });
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

  it("parseMcpServers reads a server as enabled again after a disable/enable round trip", () => {
    // .mcp.json is untouched by the toggle, so its cached entry is reused
    // across these parses — the disabled stamp must not stick to it.
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    setProjectMcpServerDisabled("srv", true, ws);
    expect(parseMcpServers(ws).servers.find((s) => s.name === "srv")?.disabled).toBe(true);
    setProjectMcpServerDisabled("srv", false, ws);
    expect(parseMcpServers(ws).servers.find((s) => s.name === "srv")?.disabled).toBeUndefined();
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

  it("re-enabling records the approval in enabledMcpjsonServers", () => {
    // enabledMcpjsonServers is Claude Code's approval list: a name in neither
    // array is re-prompted for approval on the next session.
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    setProjectMcpServerDisabled("srv", true, ws);
    setProjectMcpServerDisabled("srv", false, ws);
    expect(readLocal().enabledMcpjsonServers).toEqual(["srv"]);
    const server = parseMcpServers(ws).servers.find((s) => s.name === "srv");
    expect(server?.disabled).toBeUndefined();
    expect(server?.pendingApproval).toBeUndefined();
  });

  it("enabling keeps an approval the CLI already recorded, without duplicating it", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(localSettings, { enabledMcpjsonServers: ["other", "srv"] });
    setProjectMcpServerDisabled("srv", false, ws);
    expect(readLocal().enabledMcpjsonServers).toEqual(["other", "srv"]);
  });

  it("disabling moves the name from the approval list to the disabled list", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(localSettings, { enabledMcpjsonServers: ["srv"] });
    setProjectMcpServerDisabled("srv", true, ws);
    expect(readLocal().enabledMcpjsonServers).toBeUndefined();
    expect(readLocal().disabledMcpjsonServers).toEqual(["srv"]);
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

  it("reads a server named in neither list as pending approval, not enabled", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    const server = parseMcpServers(ws).servers.find((s) => s.name === "srv");
    expect(server?.disabled).toBeUndefined();
    expect(server?.pendingApproval).toBe(true);
  });

  it("enableAllProjectMcpServers in any scope approves unnamed servers", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(path.join(HOME, ".claude", "settings.json"), { enableAllProjectMcpServers: true });
    const server = parseMcpServers(ws).servers.find((s) => s.name === "srv");
    expect(server?.pendingApproval).toBeUndefined();
    expect(server?.disabled).toBeUndefined();
  });

  it("an explicit disable still wins over enableAllProjectMcpServers", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    writeJson(localSettings, { enableAllProjectMcpServers: true, disabledMcpjsonServers: ["srv"] });
    expect(parseMcpServers(ws).servers.find((s) => s.name === "srv")?.disabled).toBe(true);
  });

  it("does not mark global servers as pending approval", () => {
    writeJson(path.join(HOME, ".claude.json"), { mcpServers: { g: { command: "node" } } });
    expect(parseMcpServers(ws).servers.find((s) => s.name === "g")?.pendingApproval).toBeUndefined();
  });

  it.each([
    ["freshly emptied", "", "is being written by Claude Code right now"],
    ["freshly whitespace-only", "  \n", "is being written by Claude Code right now"],
    ["malformed", '{ "permissions": ', "isn't valid JSON"],
  ])("refuses to toggle when settings.local.json is %s, leaving it untouched", (_l, content, why) => {
    // An empty file is what Claude Code's settings look like mid-write;
    // rewriting it would keep nothing but our toggle arrays.
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    fs.mkdirSync(path.dirname(localSettings), { recursive: true });
    fs.writeFileSync(localSettings, content);
    const res = setProjectMcpServerDisabled("srv", true, ws);
    expect(res.ok).toBe(false);
    expect(res.error).toContain(`${localSettings} ${why}`);
    expect(fs.readFileSync(localSettings, "utf-8")).toBe(content);
  });

  it("toggles into a settings.local.json that has stayed empty past the settle window", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    fs.mkdirSync(path.dirname(localSettings), { recursive: true });
    fs.writeFileSync(localSettings, "");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(localSettings, old, old);
    expect(setProjectMcpServerDisabled("srv", true, ws)).toEqual({ ok: true });
    expect(readLocal()).toEqual({ disabledMcpjsonServers: ["srv"] });
  });

  it("refuses to toggle when settings.local.json exists but can't be read", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    fs.mkdirSync(localSettings, { recursive: true }); // EISDIR on read
    const res = setProjectMcpServerDisabled("srv", true, ws);
    expect(res.ok).toBe(false);
    expect(res.error).toContain(`${localSettings} couldn't be read`);
    expect(fs.statSync(localSettings).isDirectory()).toBe(true);
  });

  it("creates settings.local.json when it is absent", () => {
    writeJson(path.join(ws, ".mcp.json"), { mcpServers: { srv: { command: "node" } } });
    expect(setProjectMcpServerDisabled("srv", false, ws)).toEqual({ ok: true });
    expect(readLocal()).toEqual({ enabledMcpjsonServers: ["srv"] });
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
  it("deleteMcpServer refuses plugin scope", () => {
    expect(deleteMcpServer("docs", "plugin").ok).toBe(false);
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

  describe("never rewrites a config it cannot parse", () => {
    /**
     * `readConfig` used to answer a parse failure with an empty config,
     * which is also what a brand-new file looks like — so addMcpServer
     * could not tell the two apart and wrote `{ mcpServers: { new } }`
     * over a .mcp.json (or ~/.claude.json) it had failed to read,
     * discarding every other server in it.
     */
    const HOSTILE: Array<[string, string, string]> = [
      ["a JSON comment", '{\n // note\n "mcpServers": { "a": { "command": "x" } }\n}', "isn't valid JSON"],
      ["a trailing comma", '{ "mcpServers": { "a": { "command": "x" } }, }', "isn't valid JSON"],
      ["truncation", '{ "mcpServers": { "a": ', "isn't valid JSON"],
      ["a top-level array", '["nope"]', "doesn't hold a JSON object"],
    ];

    it.each(HOSTILE)("add refuses and leaves it byte-identical: %s", (_l, content, why) => {
      const file = path.join(ws, ".mcp.json");
      fs.mkdirSync(ws, { recursive: true });
      fs.writeFileSync(file, content);
      const res = addMcpServer(input({ name: "new" }), ws);
      expect(res.ok).toBe(false);
      expect(res.error).toContain(`${file} ${why}`);
      expect(fs.readFileSync(file, "utf-8")).toBe(content);
    });

    it("update refuses too", () => {
      const file = path.join(ws, ".mcp.json");
      const content = '{ "mcpServers": { "srv": { "command": "x" } }, }';
      fs.mkdirSync(ws, { recursive: true });
      fs.writeFileSync(file, content);
      expect(updateMcpServer("srv", input(), ws).ok).toBe(false);
      expect(fs.readFileSync(file, "utf-8")).toBe(content);
    });

    it("still adds to a valid file, keeping the other servers", () => {
      const file = path.join(ws, ".mcp.json");
      fs.mkdirSync(ws, { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({ mcpServers: { keep: { command: "keep" } } }, null, 2),
      );
      expect(addMcpServer(input({ name: "new" }), ws).ok).toBe(true);
      const after = readMcp();
      expect(after.keep).toEqual({ command: "keep" });
      expect(after.new).toBeTruthy();
    });
  });

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

describe("global-scope writes", () => {
  const claudeJson = path.join(HOME, ".claude.json");
  const legacy = path.join(HOME, ".claude", "mcp.json");
  const lockDir = `${claudeJson}.lock`;

  function globalInput(overrides: Partial<McpServerInput> = {}): McpServerInput {
    return { name: "g", scope: "global", transport: "stdio", command: "node", env: {}, headers: {}, ...overrides };
  }

  function readClaudeJson(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(claudeJson, "utf-8"));
  }

  const LIVE = {
    oauthAccount: { emailAddress: "a@b.c" },
    projects: { "/w": { hasTrustDialogAccepted: true } },
    mcpServers: { existing: { command: "x" } },
  };

  it("adds a new global server to ~/.claude.json, keeping every other key", () => {
    writeJson(claudeJson, LIVE);
    expect(addMcpServer(globalInput()).ok).toBe(true);
    const after = readClaudeJson();
    expect(after.oauthAccount).toEqual(LIVE.oauthAccount);
    expect(after.projects).toEqual(LIVE.projects);
    expect(after.mcpServers).toEqual({ existing: { command: "x" }, g: { command: "node" } });
    expect(fs.existsSync(legacy)).toBe(false);
  });

  it("adds to ~/.claude.json, not the legacy file, even when only the legacy file exists", () => {
    // Claude Code never reads ~/.claude/mcp.json, so a server added there is invisible to it.
    writeJson(legacy, { mcpServers: { old: { command: "o" } } });
    expect(addMcpServer(globalInput()).ok).toBe(true);
    expect(readClaudeJson().mcpServers).toEqual({ g: { command: "node" } });
    expect(JSON.parse(fs.readFileSync(legacy, "utf-8")).mcpServers).toEqual({ old: { command: "o" } });
  });

  it("rejects adding a name the legacy file already holds", () => {
    writeJson(legacy, { mcpServers: { g: { command: "o" } } });
    const r = addMcpServer(globalInput());
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/);
  });

  it("edits and deletes a legacy-file server in the legacy file", () => {
    writeJson(claudeJson, LIVE);
    writeJson(legacy, { mcpServers: { old: { command: "o" } } });
    expect(updateMcpServer("old", globalInput({ name: "old", command: "deno" })).ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(legacy, "utf-8")).mcpServers.old).toEqual({ command: "deno" });
    expect(deleteMcpServer("old", "global").ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(legacy, "utf-8")).mcpServers).toEqual({});
    expect(readClaudeJson()).toEqual(LIVE);
  });

  it("deletes a ~/.claude.json server, keeping every other key", () => {
    writeJson(claudeJson, LIVE);
    expect(deleteMcpServer("existing", "global").ok).toBe(true);
    expect(readClaudeJson()).toEqual({ ...LIVE, mcpServers: {} });
  });

  it.each([
    ["empty (mid-write)", "", "is being written by Claude Code right now"],
    ["truncated", '{ "oauthAccount": ', "isn't valid JSON"],
  ])("refuses add/update/delete when ~/.claude.json is %s", (_l, content, why) => {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(claudeJson, content);
    expect(addMcpServer(globalInput()).error).toContain(`${claudeJson} ${why}`);
    expect(updateMcpServer("existing", globalInput()).ok).toBe(false);
    expect(deleteMcpServer("existing", "global").ok).toBe(false);
    expect(fs.readFileSync(claudeJson, "utf-8")).toBe(content);
  });

  it("refuses when ~/.claude.json exists but can't be read", () => {
    fs.mkdirSync(claudeJson, { recursive: true }); // EISDIR on read
    expect(addMcpServer(globalInput()).error).toContain("couldn't be read");
  });

  it("releases Claude Code's config lock after writing", () => {
    writeJson(claudeJson, LIVE);
    expect(addMcpServer(globalInput()).ok).toBe(true);
    expect(fs.existsSync(lockDir)).toBe(false);
  });

  it(
    "refuses, leaving ~/.claude.json untouched, while Claude Code holds its config lock",
    () => {
      writeJson(claudeJson, LIVE);
      const before = fs.readFileSync(claudeJson, "utf-8");
      fs.mkdirSync(lockDir); // fresh mtime: a live holder
      const r = addMcpServer(globalInput());
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/Try again/);
      expect(fs.readFileSync(claudeJson, "utf-8")).toBe(before);
    },
    15_000,
  );

  it("does not take the config lock for project .mcp.json writes", () => {
    const ws = path.join(HOME, "ws");
    fs.mkdirSync(lockDir, { recursive: true });
    expect(addMcpServer({ ...globalInput(), scope: "project" }, ws).ok).toBe(true);
  });
});
