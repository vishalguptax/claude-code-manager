import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { HOME, PLUGINS_DIR, CACHE_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const home = _path.join(_os.tmpdir(), ".claude-test-plugins-home");
  return {
    HOME: home,
    PLUGINS_DIR: _path.join(home, ".claude", "plugins"),
    CACHE_DIR: _path.join(home, ".claude", "plugins", "cache"),
  };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import {
  loadActivePlugins,
  resolvePluginContentDirs,
  findPluginMcpFile,
  type ActivePlugin,
} from "../plugins";

interface InstalledEntry {
  scope: "user" | "project";
  projectPath?: string;
  installPath: string;
  version?: string;
}

function setupPlugin(
  qualifiedName: string,
  entries: InstalledEntry[],
  manifest?: Record<string, unknown>,
): void {
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  let installed: { plugins: Record<string, InstalledEntry[]> };
  try {
    installed = JSON.parse(fs.readFileSync(path.join(PLUGINS_DIR, "installed_plugins.json"), "utf-8"));
  } catch {
    installed = { plugins: {} };
  }
  installed.plugins[qualifiedName] = entries;
  fs.writeFileSync(
    path.join(PLUGINS_DIR, "installed_plugins.json"),
    JSON.stringify(installed, null, 2),
  );

  for (const entry of entries) {
    fs.mkdirSync(path.join(entry.installPath, ".claude-plugin"), { recursive: true });
    if (manifest) {
      fs.writeFileSync(
        path.join(entry.installPath, ".claude-plugin", "plugin.json"),
        JSON.stringify(manifest, null, 2),
      );
    }
  }
}

function setBlocklist(qualifiedNames: string[]): void {
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PLUGINS_DIR, "blocklist.json"),
    JSON.stringify({ plugins: qualifiedNames.map((qn) => ({ plugin: qn })) }, null, 2),
  );
}

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});
afterEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("loadActivePlugins", () => {
  it("returns [] when installed_plugins.json is missing", () => {
    expect(loadActivePlugins()).toEqual([]);
  });

  it("returns [] for malformed installed_plugins.json", () => {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    fs.writeFileSync(path.join(PLUGINS_DIR, "installed_plugins.json"), "{ not json");
    expect(loadActivePlugins()).toEqual([]);
  });

  it("loads a user-scope plugin and parses its manifest", () => {
    const installPath = path.join(CACHE_DIR, "mkt", "alpha", "v1");
    setupPlugin(
      "alpha@mkt",
      [{ scope: "user", installPath }],
      { name: "alpha", description: "A test plugin", skills: "./skills" },
    );
    const plugins = loadActivePlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "alpha",
      marketplace: "mkt",
      qualifiedName: "alpha@mkt",
      installPath,
      installScope: "user",
    });
    expect(plugins[0].manifest.skills).toBe("./skills");
  });

  it("returns plugin with empty manifest when plugin.json is missing", () => {
    const installPath = path.join(CACHE_DIR, "mkt", "bare", "v1");
    setupPlugin("bare@mkt", [{ scope: "user", installPath }]);
    fs.rmSync(path.join(installPath, ".claude-plugin"), { recursive: true, force: true });
    fs.mkdirSync(installPath, { recursive: true });
    const plugins = loadActivePlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest).toEqual({});
  });

  it("filters project-scope plugins by workspace path", () => {
    const projectA = path.join(HOME, "projA");
    const projectB = path.join(HOME, "projB");
    const installA = path.join(CACHE_DIR, "mkt", "proj", "vA");
    const installB = path.join(CACHE_DIR, "mkt", "proj", "vB");
    setupPlugin("proj@mkt", [
      { scope: "project", projectPath: projectA, installPath: installA },
      { scope: "project", projectPath: projectB, installPath: installB },
    ]);

    const forA = loadActivePlugins(projectA);
    expect(forA).toHaveLength(1);
    expect(forA[0].installPath).toBe(installA);

    const forB = loadActivePlugins(projectB);
    expect(forB).toHaveLength(1);
    expect(forB[0].installPath).toBe(installB);

    expect(loadActivePlugins()).toEqual([]);
  });

  it("matches project scope path case-insensitively across separators", () => {
    const projectPath = "C:\\Users\\dev\\projects\\app";
    const installPath = path.join(CACHE_DIR, "mkt", "ci", "v1");
    setupPlugin("ci@mkt", [{ scope: "project", projectPath, installPath }]);
    // Same path with different case + forward slashes — must still match.
    const plugins = loadActivePlugins("c:/users/dev/projects/app");
    expect(plugins).toHaveLength(1);
  });

  it("skips plugins listed in blocklist.json", () => {
    const installPath = path.join(CACHE_DIR, "mkt", "blocked", "v1");
    setupPlugin("blocked@mkt", [{ scope: "user", installPath }]);
    setBlocklist(["blocked@mkt"]);
    expect(loadActivePlugins()).toEqual([]);
  });

  it("skips entries whose installPath does not exist on disk", () => {
    const ghostPath = path.join(CACHE_DIR, "mkt", "ghost", "v1");
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(PLUGINS_DIR, "installed_plugins.json"),
      JSON.stringify({ plugins: { "ghost@mkt": [{ scope: "user", installPath: ghostPath }] } }),
    );
    expect(loadActivePlugins()).toEqual([]);
  });

  it("dedupes by installPath when the same plugin is recorded twice", () => {
    const installPath = path.join(CACHE_DIR, "mkt", "dup", "v1");
    setupPlugin("dup@mkt", [
      { scope: "user", installPath },
      { scope: "user", installPath },
    ]);
    expect(loadActivePlugins()).toHaveLength(1);
  });

  it("splits qualifiedName on the LAST '@' to survive names containing '@'", () => {
    const installPath = path.join(CACHE_DIR, "mkt", "at-name", "v1");
    setupPlugin("@scope/pkg@mkt", [{ scope: "user", installPath }]);
    const plugins = loadActivePlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].name).toBe("@scope/pkg");
    expect(plugins[0].marketplace).toBe("mkt");
  });

  it("sorts results by qualifiedName for stable ordering", () => {
    setupPlugin("z@mkt", [{ scope: "user", installPath: path.join(CACHE_DIR, "mkt", "z", "v") }]);
    setupPlugin("a@mkt", [{ scope: "user", installPath: path.join(CACHE_DIR, "mkt", "a", "v") }]);
    setupPlugin("m@mkt", [{ scope: "user", installPath: path.join(CACHE_DIR, "mkt", "m", "v") }]);
    expect(loadActivePlugins().map((p) => p.qualifiedName)).toEqual([
      "a@mkt",
      "m@mkt",
      "z@mkt",
    ]);
  });
});

describe("resolvePluginContentDirs", () => {
  function makePlugin(manifest: Record<string, unknown>): ActivePlugin {
    const installPath = path.join(CACHE_DIR, "mkt", "x", "v1");
    fs.mkdirSync(installPath, { recursive: true });
    return {
      name: "x",
      marketplace: "mkt",
      qualifiedName: "x@mkt",
      installPath,
      installScope: "user",
      manifest,
    };
  }

  it("falls back to the convention dir when manifest omits the field", () => {
    const plugin = makePlugin({});
    fs.mkdirSync(path.join(plugin.installPath, "skills"));
    expect(resolvePluginContentDirs(plugin, "skills", "skills")).toEqual([
      path.join(plugin.installPath, "skills"),
    ]);
  });

  it("returns [] when convention dir does not exist", () => {
    const plugin = makePlugin({});
    expect(resolvePluginContentDirs(plugin, "skills", "skills")).toEqual([]);
  });

  it("accepts a single string path", () => {
    const plugin = makePlugin({ skills: "./my-skills" });
    fs.mkdirSync(path.join(plugin.installPath, "my-skills"));
    expect(resolvePluginContentDirs(plugin, "skills", "skills")).toEqual([
      path.join(plugin.installPath, "my-skills"),
    ]);
  });

  it("accepts an array of paths and keeps the ones that exist", () => {
    const plugin = makePlugin({ skills: ["./a", "./b", "./missing"] });
    fs.mkdirSync(path.join(plugin.installPath, "a"));
    fs.mkdirSync(path.join(plugin.installPath, "b"));
    const out = resolvePluginContentDirs(plugin, "skills", "skills");
    expect(out).toContain(path.join(plugin.installPath, "a"));
    expect(out).toContain(path.join(plugin.installPath, "b"));
    expect(out).toHaveLength(2);
  });

  it("rejects absolute paths", () => {
    const plugin = makePlugin({ skills: "/etc" });
    expect(resolvePluginContentDirs(plugin, "skills", "skills")).toEqual([]);
  });

  it("rejects paths that escape the plugin root", () => {
    const plugin = makePlugin({ skills: "../../../outside" });
    // Create the outside dir so the only thing rejecting it is the
    // root-prefix guard, not the existence check.
    fs.mkdirSync(path.join(plugin.installPath, "..", "..", "..", "outside"), { recursive: true });
    expect(resolvePluginContentDirs(plugin, "skills", "skills")).toEqual([]);
  });
});

describe("findPluginMcpFile", () => {
  function makePlugin(): ActivePlugin {
    const installPath = path.join(CACHE_DIR, "mkt", "m", "v1");
    fs.mkdirSync(installPath, { recursive: true });
    return {
      name: "m",
      marketplace: "mkt",
      qualifiedName: "m@mkt",
      installPath,
      installScope: "user",
      manifest: {},
    };
  }

  it("returns undefined when no mcp file is present", () => {
    expect(findPluginMcpFile(makePlugin())).toBeUndefined();
  });

  it("prefers .mcp.json over mcp.json", () => {
    const plugin = makePlugin();
    fs.writeFileSync(path.join(plugin.installPath, ".mcp.json"), "{}");
    fs.writeFileSync(path.join(plugin.installPath, "mcp.json"), "{}");
    expect(findPluginMcpFile(plugin)).toBe(path.join(plugin.installPath, ".mcp.json"));
  });

  it("falls back to mcp.json when .mcp.json is missing", () => {
    const plugin = makePlugin();
    fs.writeFileSync(path.join(plugin.installPath, "mcp.json"), "{}");
    expect(findPluginMcpFile(plugin)).toBe(path.join(plugin.installPath, "mcp.json"));
  });
});
