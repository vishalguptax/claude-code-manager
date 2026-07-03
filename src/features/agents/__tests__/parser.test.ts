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
  it("returns no agents when nothing is configured", () => {
    expect(parseAgents().agents).toEqual([]);
  });

  it("reads global agents from ~/.claude/agents/", () => {
    writeAgent(path.join(HOME, ".claude", "agents"), "reviewer.md", fm("reviewer"));
    const agents = parseAgents().agents;
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("reviewer");
    expect(agents[0].scope).toBe("global");
  });

  it("reads project agents from <workspace>/.claude/agents/", () => {
    const ws = path.join(HOME, "ws");
    writeAgent(path.join(ws, ".claude", "agents"), "scout.md", fm("scout"));
    const agents = parseAgents(ws).agents;
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

    const agents = parseAgents().agents;
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

    const agents = parseAgents().agents;
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
    expect(parseAgents().agents).toEqual([]);
  });
});

describe("parseAgents — frontmatter fields", () => {
  const dir = path.join(HOME, ".claude", "agents");

  it("defaults model to 'inherit' when the frontmatter omits it", () => {
    writeAgent(dir, "a.md", `---\nname: a\ndescription: no model here\n---\nbody`);
    expect(parseAgents().agents[0].model).toBe("inherit");
  });

  it("strips surrounding quotes from a quoted model value", () => {
    writeAgent(dir, "a.md", `---\nname: a\nmodel: "opus"\n---\nbody`);
    expect(parseAgents().agents[0].model).toBe("opus");
  });

  it("parses tools as an inline flow list", () => {
    writeAgent(dir, "a.md", `---\nname: a\ntools: [Read, Grep, Bash]\n---\nbody`);
    expect(parseAgents().agents[0].tools).toEqual(["Read", "Grep", "Bash"]);
  });

  it("parses tools as a block list", () => {
    writeAgent(dir, "a.md", `---\nname: a\ntools:\n  - Read\n  - Grep\n---\nbody`);
    expect(parseAgents().agents[0].tools).toEqual(["Read", "Grep"]);
  });

  it("parses a comma-separated tools scalar", () => {
    writeAgent(dir, "a.md", `---\nname: a\ntools: Read, Grep\n---\nbody`);
    expect(parseAgents().agents[0].tools).toEqual(["Read", "Grep"]);
  });

  it("parses skills and leaves tools/skills undefined when absent", () => {
    writeAgent(dir, "a.md", `---\nname: a\nskills: [research, writing]\n---\nbody`);
    const agent = parseAgents().agents[0];
    expect(agent.skills).toEqual(["research", "writing"]);
    expect(agent.tools).toBeUndefined();
  });

  it("handles a block-scalar description and a filename fallback for missing name", () => {
    writeAgent(dir, "helper.md", `---\ndescription: >-\n  A multi-line\n  folded description.\n---\nbody`);
    const agent = parseAgents().agents[0];
    expect(agent.name).toBe("helper");
    expect(agent.description).toBe("A multi-line folded description.");
  });

  it("handles CRLF frontmatter", () => {
    writeAgent(dir, "a.md", `---\r\nname: crlf\r\nmodel: haiku\r\n---\r\nbody`);
    const agent = parseAgents().agents[0];
    expect(agent.name).toBe("crlf");
    expect(agent.model).toBe("haiku");
  });
});

describe("parseAgents — error surfacing", () => {
  it("reports a directory read failure but keeps other scopes", () => {
    // A file where the agents directory is expected — readdirSync throws
    // ENOTDIR, which is surfaced as an error (not ENOENT, which is silent).
    const ws = path.join(HOME, "ws");
    fs.mkdirSync(path.join(ws, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(ws, ".claude", "agents"), "not a directory");
    writeAgent(path.join(HOME, ".claude", "agents"), "g.md", fm("g"));
    const result = parseAgents(ws);
    expect(result.agents.map((a) => a.name)).toEqual(["g"]);
    expect(result.errors).toHaveLength(1);
  });

  it("returns no errors on a clean parse", () => {
    writeAgent(path.join(HOME, ".claude", "agents"), "g.md", fm("g"));
    expect(parseAgents().errors).toEqual([]);
  });
});
