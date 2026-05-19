import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-agents-home") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import { parseAgents } from "../parser";

function writeAgent(dir: string, file: string, body: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}

function fm(name: string, model = "sonnet", desc = ""): string {
  return `---\nname: ${name}\nmodel: ${model}\ndescription: ${desc}\n---\nbody`;
}

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});
afterEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("parseAgents", () => {
  it("returns [] when nothing is configured", () => {
    expect(parseAgents()).toEqual([]);
  });

  it("reads global agents from ~/.claude/agents/", () => {
    writeAgent(path.join(HOME, ".claude", "agents"), "reviewer.md", fm("reviewer"));
    const agents = parseAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("reviewer");
    expect(agents[0].scope).toBe("global");
  });

  it("reads project agents from <workspace>/.claude/agents/", () => {
    const ws = path.join(HOME, "ws");
    writeAgent(path.join(ws, ".claude", "agents"), "scout.md", fm("scout"));
    const agents = parseAgents(ws);
    expect(agents.find((a) => a.name === "scout")?.scope).toBe("project");
  });

  it("discovers plugin-provided agents", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "p", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "{}");
    writeAgent(path.join(pluginRoot, "agents"), "spec.md", fm("spec", "opus"));
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        plugins: { "p@mkt": [{ scope: "user", installPath: pluginRoot }] },
      }),
    );

    const agents = parseAgents();
    const plug = agents.find((a) => a.scope === "plugin");
    expect(plug).toBeDefined();
    expect(plug?.name).toBe("spec");
    expect(plug?.pluginName).toBe("p@mkt");
  });

  it("honours a manifest.agents path override", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "x", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, ".claude-plugin", "plugin.json"),
      JSON.stringify({ agents: "./custom-agents" }),
    );
    writeAgent(path.join(pluginRoot, "custom-agents"), "a.md", fm("a"));
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        plugins: { "x@mkt": [{ scope: "user", installPath: pluginRoot }] },
      }),
    );

    const agents = parseAgents();
    expect(agents.some((a) => a.scope === "plugin" && a.name === "a")).toBe(true);
  });

  it("does not surface plugin agents when convention dir is missing", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "empty", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "{}");
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        plugins: { "empty@mkt": [{ scope: "user", installPath: pluginRoot }] },
      }),
    );
    expect(parseAgents()).toEqual([]);
  });
});
