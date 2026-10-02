import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPluginsData,
  marketplacePolicyLabel,
  marketplacePolicyMatches,
  readKnownMarketplaces,
  readManagedScope,
  readMarketplaceCatalogs,
  readPluginBlocklist,
  readPluginSources,
  readSettingsScope,
  resolveEnabledPlugins,
  resolvePluginConfigs,
  settingsScopePaths,
} from "../parser";
import { normaliseEnabledValue } from "../../../core/plugins";
import type { RawCatalogPlugin } from "../catalog";
import { install, marketplace, scopes } from "./fixtures";

const CAVEMAN = "caveman@caveman";
const SEO = "claude-seo@agricidaniel-claude-seo";

describe("normaliseEnabledValue", () => {
  it("reads the boolean form", () => {
    expect(normaliseEnabledValue(true)).toBe(true);
    expect(normaliseEnabledValue(false)).toBe(false);
  });

  it("treats the extended version-constraint forms as enabled", () => {
    expect(normaliseEnabledValue(["2.x"])).toBe(true);
    expect(normaliseEnabledValue({ version: "2.x" })).toBe(true);
  });

  it("honours an explicit enabled flag inside the extended form", () => {
    expect(normaliseEnabledValue({ version: "2.x", enabled: false })).toBe(false);
  });

  it("returns null for a value that decides nothing", () => {
    expect(normaliseEnabledValue("yes")).toBeNull();
    expect(normaliseEnabledValue(null)).toBeNull();
    expect(normaliseEnabledValue(3)).toBeNull();
  });
});

describe("resolveEnabledPlugins", () => {
  it("lets the highest scope that mentions a plugin decide it", () => {
    const resolved = resolveEnabledPlugins(
      scopes({
        global: { enabledPlugins: { [CAVEMAN]: true } },
        project: { enabledPlugins: { [CAVEMAN]: false } },
      }),
    );
    expect(resolved.get(CAVEMAN)).toMatchObject({ enabled: false, decidedBy: "project" });
  });

  it("reports local as the decider when local overrides project", () => {
    const resolved = resolveEnabledPlugins(
      scopes({
        global: { enabledPlugins: { [CAVEMAN]: false } },
        project: { enabledPlugins: { [CAVEMAN]: true } },
        local: { enabledPlugins: { [CAVEMAN]: false } },
      }),
    );
    const entry = resolved.get(CAVEMAN);
    expect(entry?.enabled).toBe(false);
    expect(entry?.decidedBy).toBe("local");
    expect(entry?.declaredIn).toEqual([
      { scope: "global", enabled: false },
      { scope: "project", enabled: true },
      { scope: "local", enabled: false },
    ]);
  });

  it("merges per plugin id rather than replacing the whole map", () => {
    const resolved = resolveEnabledPlugins(
      scopes({
        global: { enabledPlugins: { [CAVEMAN]: true } },
        project: { enabledPlugins: { [SEO]: true } },
      }),
    );
    expect(resolved.get(CAVEMAN)?.enabled).toBe(true);
    expect(resolved.get(SEO)?.enabled).toBe(true);
  });

  it("drops ids that try to traverse and values that decide nothing", () => {
    const resolved = resolveEnabledPlugins(
      scopes({
        global: { enabledPlugins: { "../../etc/passwd@evil": true, [CAVEMAN]: "yes" } },
      }),
    );
    expect(resolved.size).toBe(0);
  });
});

describe("resolvePluginConfigs", () => {
  it("shallow-merges a plugin's config across scopes", () => {
    const merged = resolvePluginConfigs(
      scopes({
        global: { pluginConfigs: { [CAVEMAN]: { options: { a: 1 }, keep: true } } },
        local: { pluginConfigs: { [CAVEMAN]: { options: { b: 2 } } } },
      }),
    );
    expect(merged.get(CAVEMAN)).toEqual({ options: { b: 2 }, keep: true });
  });
});

describe("marketplacePolicyMatches", () => {
  const mkt = { name: "expo-plugins", sourceKind: "github", sourceRef: "expo/skills" };

  it("matches a bare marketplace name", () => {
    expect(marketplacePolicyMatches("expo-plugins", mkt)).toBe(true);
    expect(marketplacePolicyMatches("other", mkt)).toBe(false);
  });

  it("matches an exact source object", () => {
    expect(marketplacePolicyMatches({ source: "github", repo: "expo/skills" }, mkt)).toBe(true);
    expect(marketplacePolicyMatches({ source: "github", repo: "expo/other" }, mkt)).toBe(false);
    expect(marketplacePolicyMatches({ source: "git", repo: "expo/skills" }, mkt)).toBe(false);
  });

  it("honours the owner-wildcard form for github entries only", () => {
    expect(marketplacePolicyMatches({ source: "github", repo: "expo/*" }, mkt)).toBe(true);
    expect(marketplacePolicyMatches({ source: "github", repo: "exp/*" }, mkt)).toBe(false);
    expect(
      marketplacePolicyMatches({ source: "git", repo: "expo/*" }, { ...mkt, sourceKind: "git" }),
    ).toBe(false);
  });

  it("ignores entries with no usable reference", () => {
    expect(marketplacePolicyMatches({ source: "github" }, mkt)).toBe(false);
    expect(marketplacePolicyMatches(42, mkt)).toBe(false);
  });
});

describe("marketplacePolicyLabel", () => {
  it("renders names and source objects", () => {
    expect(marketplacePolicyLabel("expo-plugins")).toBe("expo-plugins");
    expect(marketplacePolicyLabel({ source: "github", repo: "expo/*" })).toBe("github:expo/*");
    expect(marketplacePolicyLabel({ source: "local", path: "/srv/mkt" })).toBe("local:/srv/mkt");
  });
});

describe("buildPluginsData — the three states nothing else surfaces", () => {
  it("flags a plugin that is installed but never enabled", () => {
    const data = buildPluginsData({
      scopes: scopes(),
      active: [install(CAVEMAN)],
      known: { caveman: marketplace("JuliusBrussee/caveman") },
      blocked: [],
      catalogs: {},
    });
    const row = data.plugins[0];
    expect(row.status).toBe("not-enabled");
    expect(row.installed).toBe(true);
    expect(row.enabled).toBe(false);
    expect(row.decidedBy).toBeNull();
  });

  it("flags an enabledPlugins entry with no install behind it", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { enabledPlugins: { [SEO]: true } } }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    const row = data.plugins[0];
    expect(row.id).toBe(SEO);
    expect(row.status).toBe("orphaned");
    expect(row.installed).toBe(false);
    expect(row.enabled).toBe(true);
    expect(row.installPath).toBe("");
  });

  it("flags a plugin enabled from a marketplace the allowlist does not cover", () => {
    const data = buildPluginsData({
      scopes: scopes({
        global: { enabledPlugins: { [CAVEMAN]: true } },
        managed: {
          strictKnownMarketplaces: [{ source: "github", repo: "anthropics/*" }],
        },
      }),
      active: [install(CAVEMAN)],
      known: { caveman: marketplace("JuliusBrussee/caveman") },
      blocked: [],
      catalogs: {},
    });
    const row = data.plugins[0];
    expect(row.status).toBe("enabled");
    expect(row.marketplaceTrust).toBe("unlisted");
    expect(row.untrustedSource).toBe(true);
  });
});

describe("buildPluginsData — enablement across scopes", () => {
  it("reports the winning scope for a user-scope enable", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { enabledPlugins: { [CAVEMAN]: true } } }),
      active: [install(CAVEMAN)],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins[0]).toMatchObject({
      status: "enabled",
      enabled: true,
      decidedBy: "global",
    });
  });

  it("reports project as the decider when project overrides the user scope", () => {
    const data = buildPluginsData({
      scopes: scopes({
        global: { enabledPlugins: { [CAVEMAN]: true } },
        project: { enabledPlugins: { [CAVEMAN]: false } },
      }),
      active: [install(CAVEMAN)],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins[0]).toMatchObject({
      status: "disabled",
      enabled: false,
      decidedBy: "project",
    });
  });

  it("reports local as the decider when local overrides project", () => {
    const data = buildPluginsData({
      scopes: scopes({
        global: { enabledPlugins: { [CAVEMAN]: false } },
        project: { enabledPlugins: { [CAVEMAN]: false } },
        local: { enabledPlugins: { [CAVEMAN]: true } },
      }),
      active: [install(CAVEMAN)],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins[0]).toMatchObject({
      status: "enabled",
      enabled: true,
      decidedBy: "local",
    });
    expect(data.plugins[0].declaredIn).toHaveLength(3);
  });

  it("carries the merged pluginConfigs onto the row", () => {
    const data = buildPluginsData({
      scopes: scopes({ local: { pluginConfigs: { [CAVEMAN]: { options: { tone: "grunt" } } } } }),
      active: [install(CAVEMAN)],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins[0].config).toEqual({ options: { tone: "grunt" } });
  });
});

describe("buildPluginsData — blocklist", () => {
  it("surfaces a blocked plugin that loadActivePlugins has filtered away", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { enabledPlugins: { [CAVEMAN]: true } } }),
      active: [],
      known: {},
      blocked: [CAVEMAN],
      catalogs: {},
    });
    const row = data.plugins[0];
    expect(row.status).toBe("blocked");
    expect(row.enabled).toBe(true);
    // Blocked beats "enabled with no install": Claude Code refuses it whatever
    // the settings say, so that is the state worth reporting.
    expect(row.untrustedSource).toBe(false);
  });

  it("ignores blocklist entries that are not valid plugin ids", () => {
    const data = buildPluginsData({
      scopes: scopes(),
      active: [],
      known: {},
      blocked: ["../../etc/passwd@evil", ""],
      catalogs: {},
    });
    expect(data.plugins).toHaveLength(0);
  });
});

describe("buildPluginsData — marketplace trust", () => {
  const base = {
    active: [install(CAVEMAN)],
    known: { caveman: marketplace("JuliusBrussee/caveman") },
    blocked: [] as string[],
    catalogs: {},
  };

  it("reports a registered marketplace as known when no allowlist is in force", () => {
    const data = buildPluginsData({ scopes: scopes(), ...base });
    expect(data.marketplaces.find((m) => m.name === "caveman")).toMatchObject({
      trust: "known",
      registered: true,
      sourceKind: "github",
      sourceLabel: "JuliusBrussee/caveman",
      pluginCount: 1,
    });
  });

  it("switches the same marketplace to unlisted once an allowlist exists", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { strictKnownMarketplaces: ["expo-plugins"] } }),
      ...base,
    });
    expect(data.marketplaces.find((m) => m.name === "caveman")?.trust).toBe("unlisted");
  });

  it("allowlists a marketplace named directly", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { strictKnownMarketplaces: ["caveman"] } }),
      ...base,
    });
    expect(data.marketplaces.find((m) => m.name === "caveman")?.trust).toBe("allowlisted");
  });

  it("exempts the official marketplace from an allowlist", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { strictKnownMarketplaces: ["nothing"] } }),
      active: [install("skills@claude-plugins-official")],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(
      data.marketplaces.find((m) => m.name === "claude-plugins-official")?.trust,
    ).toBe("official");
  });

  it("lets blockedMarketplaces beat an allowlist match", () => {
    const data = buildPluginsData({
      scopes: scopes({
        managed: {
          strictKnownMarketplaces: ["caveman"],
          blockedMarketplaces: [{ source: "github", repo: "JuliusBrussee/*" }],
        },
      }),
      ...base,
    });
    expect(data.marketplaces.find((m) => m.name === "caveman")?.trust).toBe("blocked");
  });

  it("reports a marketplace cited by a plugin but never registered as unknown", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { enabledPlugins: { "ghost@nowhere": true } } }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.marketplaces.find((m) => m.name === "nowhere")).toMatchObject({
      trust: "unknown",
      registered: false,
      pluginCount: 1,
    });
  });

  it("records which scopes pre-register a marketplace via extraKnownMarketplaces", () => {
    const data = buildPluginsData({
      scopes: scopes({
        global: {
          extraKnownMarketplaces: { "expo-plugins": { source: { source: "github", repo: "expo/skills" } } },
        },
      }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.marketplaces[0]).toMatchObject({
      name: "expo-plugins",
      declaredIn: ["global"],
      sourceLabel: "expo/skills",
      registered: false,
    });
  });

  it("reads additionalMarketplaces as the alias for extraKnownMarketplaces", () => {
    const data = buildPluginsData({
      scopes: scopes({
        project: {
          additionalMarketplaces: { "expo-plugins": { source: { source: "github", repo: "expo/skills" } } },
        },
      }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.marketplaces[0]).toMatchObject({ name: "expo-plugins", declaredIn: ["project"] });
  });
});

describe("buildPluginsData — policy keys", () => {
  it("reads allowedMarketplaces as the alias for strictKnownMarketplaces", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { allowedMarketplaces: ["caveman"] } }),
      active: [install(CAVEMAN)],
      known: { caveman: marketplace("JuliusBrussee/caveman") },
      blocked: [],
      catalogs: {},
    });
    expect(data.marketplaces.find((m) => m.name === "caveman")?.trust).toBe("allowlisted");
    expect(data.policy).toContainEqual({
      key: "strictKnownMarketplaces",
      scope: "managed",
      value: ["caveman"],
      managedOnly: true,
      ignored: false,
    });
  });

  it("warns when one file sets both a key and its alias, and keeps the canonical", () => {
    const data = buildPluginsData({
      scopes: scopes({
        managed: { strictKnownMarketplaces: ["caveman"], allowedMarketplaces: ["expo-plugins"] },
      }),
      active: [install(CAVEMAN)],
      known: { caveman: marketplace("JuliusBrussee/caveman") },
      blocked: [],
      catalogs: {},
    });
    expect(data.errors.join(" ")).toContain("ignores the alias");
    expect(data.marketplaces.find((m) => m.name === "caveman")?.trust).toBe("allowlisted");
  });

  it("marks a managed-only key found in user settings as ignored, and does not apply it", () => {
    const data = buildPluginsData({
      scopes: scopes({
        global: {
          strictKnownMarketplaces: ["expo-plugins"],
          enabledPlugins: { [CAVEMAN]: true },
        },
      }),
      active: [install(CAVEMAN)],
      known: { caveman: marketplace("JuliusBrussee/caveman") },
      blocked: [],
      catalogs: {},
    });
    expect(data.policy).toContainEqual({
      key: "strictKnownMarketplaces",
      scope: "global",
      value: ["expo-plugins"],
      managedOnly: true,
      ignored: true,
    });
    // The allowlist was ignored, so caveman keeps its ordinary trust.
    expect(data.marketplaces.find((m) => m.name === "caveman")?.trust).toBe("known");
    expect(data.plugins[0].untrustedSource).toBe(false);
  });

  it("records the boolean sync keys with the scope that set them", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { syncClaudeAiPlugins: false, syncClaudeAiSkills: true } }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.policy).toContainEqual({
      key: "syncClaudeAiPlugins",
      scope: "global",
      value: false,
      managedOnly: false,
      ignored: false,
    });
    expect(data.policy.find((p) => p.key === "syncClaudeAiSkills")?.value).toBe(true);
  });

  it("ignores a sync opt-out in project or local settings, like Claude Code", () => {
    const data = buildPluginsData({
      scopes: scopes({
        global: { syncClaudeAiPlugins: true },
        project: { syncClaudeAiPlugins: false },
        local: { syncClaudeAiSkills: false },
      }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    // The user file, which Claude Code does read, decides the plugins key…
    expect(data.policy.find((p) => p.key === "syncClaudeAiPlugins")).toMatchObject({
      scope: "global",
      value: true,
      ignored: false,
    });
    // …and a key only a project/local file sets is listed as ignored.
    expect(data.policy.find((p) => p.key === "syncClaudeAiSkills")).toMatchObject({
      scope: "local",
      value: false,
      ignored: true,
    });
  });

  it("lets managed settings decide a sync opt-out over user settings", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { syncClaudeAiSkills: true }, managed: { syncClaudeAiSkills: false } }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.policy.find((p) => p.key === "syncClaudeAiSkills")).toMatchObject({
      scope: "managed",
      ignored: false,
    });
  });

  it("lets the highest scope own a policy list outright", () => {
    const data = buildPluginsData({
      scopes: scopes({
        global: { appendPlugins: ["a@m"] },
        managed: { appendPlugins: ["b@m"] },
      }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    const entries = data.policy.filter((p) => p.key === "appendPlugins");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ scope: "managed", value: ["b@m"] });
  });

  it("ignores a policy key whose value is the wrong type", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { blockedMarketplaces: "everything" } }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.policy.find((p) => p.key === "blockedMarketplaces")).toBeUndefined();
  });
});

describe("buildPluginsData — degraded inputs", () => {
  it("keeps going when a settings file is unreadable and reports it once", () => {
    const withError = scopes({ global: { enabledPlugins: { [CAVEMAN]: true } } });
    withError[1] = { ...withError[1], error: "/repo/.claude/settings.json could not be read" };
    const data = buildPluginsData({
      scopes: withError,
      active: [install(CAVEMAN)],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.errors).toEqual(["/repo/.claude/settings.json could not be read"]);
    expect(data.plugins[0].status).toBe("enabled");
  });

  it("returns empty collections when nothing exists at all", () => {
    const data = buildPluginsData({ scopes: scopes(), active: [], known: {}, blocked: [], catalogs: {} });
    expect(data).toEqual({ plugins: [], marketplaces: [], policy: [], available: [], errors: [] });
  });

  it("ignores an enabledPlugins key that is not an object", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { enabledPlugins: ["caveman@caveman"] } }),
      active: [],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins).toHaveLength(0);
  });

  it("sorts plugins and marketplaces by id so the list is stable", () => {
    const data = buildPluginsData({
      scopes: scopes(),
      active: [install("zeta@zmkt"), install("alpha@amkt")],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins.map((p) => p.id)).toEqual(["alpha@amkt", "zeta@zmkt"]);
    expect(data.marketplaces.map((m) => m.name)).toEqual(["amkt", "zmkt"]);
  });

  it("drops an install whose qualified name is not a safe id", () => {
    const data = buildPluginsData({
      scopes: scopes(),
      active: [install(CAVEMAN, { qualifiedName: "../../etc@x" })],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins).toHaveLength(0);
  });
});

describe("buildPluginsData — what the marketplaces offer", () => {
  /** A catalog entry as `parseCatalog` produces it. */
  const offer = (name: string, extra: Partial<RawCatalogPlugin> = {}): RawCatalogPlugin => ({
    name,
    description: `${name} does things`,
    category: "",
    author: "",
    homepage: "",
    ...extra,
  });
  const known = {
    caveman: marketplace("JuliusBrussee/caveman"),
    "claude-plugins-official": marketplace("anthropics/claude-plugins-official"),
  };
  const catalogs = {
    caveman: [offer("caveman"), offer("grunt")],
    "claude-plugins-official": [offer("swift-lsp")],
  };

  it("offers every catalog entry, Anthropic's marketplace first, installed ones flagged", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { enabledPlugins: { [CAVEMAN]: true } } }),
      active: [install(CAVEMAN)],
      known,
      blocked: [],
      catalogs,
    });
    expect(data.available.map((p) => [p.id, p.installed])).toEqual([
      ["swift-lsp@claude-plugins-official", false],
      ["caveman@caveman", true],
      ["grunt@caveman", false],
    ]);
  });

  it("never offers a blocklisted plugin", () => {
    const data = buildPluginsData({
      scopes: scopes(),
      active: [],
      known,
      blocked: ["grunt@caveman"],
      catalogs,
    });
    expect(data.available.map((p) => p.id)).not.toContain("grunt@caveman");
  });

  it("offers nothing from a marketplace the managed policy blocks", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { blockedMarketplaces: ["caveman"] } }),
      active: [],
      known,
      blocked: [],
      catalogs,
    });
    expect(data.available.map((p) => p.id)).toEqual(["swift-lsp@claude-plugins-official"]);
  });

  it("offers nothing from a marketplace an allowlist leaves out, but keeps the official one", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { strictKnownMarketplaces: ["somewhere-else"] } }),
      active: [],
      known,
      blocked: [],
      catalogs,
    });
    expect(data.available.map((p) => p.id)).toEqual(["swift-lsp@claude-plugins-official"]);
  });
});

describe("buildPluginsData — plugins synced from claude.ai", () => {
  // As loadActivePlugins returns a `plugins/synced/<bucket>/design` install.
  const design = install("design@synced", {
    installPath:
      "/Users/dev/.claude/plugins/synced/9fed4216-cef8-4112-a5f1-f6d81fd0cc9b_37a1ad5d-577a-4eda-999e-63a49f2c7ef8/design",
    manifest: { name: "design", version: "1.2.0", description: "Accelerate design workflows" },
    synced: true,
  });

  it("lists it as enabled by sync, from claude.ai, with no settings entry needed", () => {
    const data = buildPluginsData({
      scopes: scopes(),
      active: [design],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins).toEqual([
      expect.objectContaining({
        id: "design@synced",
        name: "design",
        marketplace: "claude.ai",
        synced: true,
        installed: true,
        enabled: true,
        status: "enabled",
        decidedBy: null,
        version: "1.2.0",
        untrustedSource: false,
      }),
    ]);
  });

  it("does not invent a `synced` marketplace", () => {
    const data = buildPluginsData({
      scopes: scopes({ managed: { strictKnownMarketplaces: ["corp"] } }),
      active: [design, install(CAVEMAN)],
      known: { caveman: marketplace("JuliusBrussee/caveman") },
      blocked: [],
      catalogs: {},
    });
    expect(data.marketplaces.map((m) => m.name)).toEqual(["caveman"]);
    expect(data.plugins.find((p) => p.id === "design@synced")?.untrustedSource).toBe(false);
  });

  it("marks installed plugins as not synced", () => {
    const data = buildPluginsData({
      scopes: scopes({ global: { enabledPlugins: { [CAVEMAN]: true } } }),
      active: [install(CAVEMAN)],
      known: {},
      blocked: [],
      catalogs: {},
    });
    expect(data.plugins[0].synced).toBe(false);
  });
});

// ── Filesystem-facing readers ──────────────────────────────────────────────

const ROOT = path.join(os.tmpdir(), "claude-manager-plugins-test");

function write(file: string, contents: string): string {
  const full = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
}

describe("readSettingsScope", () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
  });
  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  it("returns the data with no error for a healthy file", () => {
    const file = write("settings.json", '{"enabledPlugins":{"a@b":true}}');
    expect(readSettingsScope("global", file)).toMatchObject({
      scope: "global",
      data: { enabledPlugins: { "a@b": true } },
      error: null,
    });
  });

  it("stays silent about a settings file that has never been written", () => {
    expect(readSettingsScope("local", path.join(ROOT, "settings.local.json"))).toMatchObject({
      data: null,
      error: null,
    });
  });

  it("reports a malformed settings file without throwing", () => {
    const file = write("settings.json", "{ oops");
    const read = readSettingsScope("project", file);
    expect(read.data).toBeNull();
    expect(read.error).toContain("Claude Code skips it too");
  });
});

describe("readKnownMarketplaces", () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
  });
  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  it("reads the real file shape", () => {
    const file = write(
      "known_marketplaces.json",
      JSON.stringify({
        "expo-plugins": {
          source: { source: "github", repo: "expo/skills" },
          installLocation: "/home/dev/.claude/plugins/marketplaces/expo-plugins",
          lastUpdated: "2026-07-04T14:35:31.000Z",
        },
      }),
    );
    expect(readKnownMarketplaces(file)["expo-plugins"]).toEqual({
      source: { source: "github", repo: "expo/skills" },
      installLocation: "/home/dev/.claude/plugins/marketplaces/expo-plugins",
      lastUpdated: "2026-07-04T14:35:31.000Z",
    });
  });

  it("returns an empty map when the plugins directory does not exist", () => {
    expect(readKnownMarketplaces(path.join(ROOT, "missing", "known_marketplaces.json"))).toEqual({});
  });

  it("skips entries that are not objects", () => {
    const file = write("known_marketplaces.json", '{"a":"nope","b":{}}');
    expect(Object.keys(readKnownMarketplaces(file))).toEqual(["b"]);
  });
});

describe("readMarketplaceCatalogs", () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
  });
  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  const at = (name: string) => ({ installLocation: path.join(ROOT, "marketplaces", name) });

  it("reads each clone's .claude-plugin/marketplace.json", () => {
    write(
      "marketplaces/expo-plugins/.claude-plugin/marketplace.json",
      JSON.stringify({
        name: "expo-plugins",
        plugins: [{ name: "expo", description: "Official Expo skills", source: "./plugins/expo" }],
      }),
    );
    expect(readMarketplaceCatalogs({ "expo-plugins": at("expo-plugins") })).toEqual({
      "expo-plugins": [
        { name: "expo", description: "Official Expo skills", category: "", author: "", homepage: "" },
      ],
    });
  });

  it("yields an empty catalog for a clone with a missing or malformed catalog", () => {
    write("marketplaces/broken/.claude-plugin/marketplace.json", "{ not json");
    expect(readMarketplaceCatalogs({ broken: at("broken"), missing: at("missing") })).toEqual({
      broken: [],
      missing: [],
    });
  });

  it("skips a marketplace with no recorded clone", () => {
    expect(readMarketplaceCatalogs({ ghost: {} })).toEqual({});
  });
});

describe("readPluginBlocklist", () => {
  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
  });
  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  it("reads the qualified names out of the plugins array", () => {
    const file = write(
      "blocklist.json",
      JSON.stringify({ plugins: [{ plugin: CAVEMAN }, { plugin: SEO }, { other: 1 }] }),
    );
    expect(readPluginBlocklist(file)).toEqual([CAVEMAN, SEO]);
  });

  it("returns an empty list when the file is absent — the usual case", () => {
    expect(readPluginBlocklist(path.join(ROOT, "blocklist.json"))).toEqual([]);
  });

  it("returns an empty list when plugins is not an array", () => {
    expect(readPluginBlocklist(write("blocklist.json", '{"plugins":{}}'))).toEqual([]);
  });
});

describe("settingsScopePaths", () => {
  it("resolves all four scopes, lowest precedence first, when a workspace is open", () => {
    const paths = settingsScopePaths("/repo", "/home/dev/.claude/settings.json", "/policy.json");
    expect(paths.map((p) => p.scope)).toEqual(["global", "project", "local", "managed"]);
    expect(paths[1].filePath).toBe(path.join("/repo", ".claude", "settings.json"));
    expect(paths[2].filePath).toBe(path.join("/repo", ".claude", "settings.local.json"));
  });

  it("drops project and local when there is no workspace", () => {
    const paths = settingsScopePaths(undefined, "/home/dev/.claude/settings.json", "/policy.json");
    expect(paths.map((p) => p.scope)).toEqual(["global", "managed"]);
  });
});

describe("readManagedScope", () => {
  it("presents the managed tier as one scope named after its winning source", () => {
    const read = readManagedScope({
      settings: { blockedMarketplaces: ["rogue-mkt"] },
      source: "/Users/dev/.claude/remote-settings.json",
      errors: [],
    });
    expect(read).toEqual({
      scope: "managed",
      filePath: "/Users/dev/.claude/remote-settings.json",
      data: { blockedMarketplaces: ["rogue-mkt"] },
      error: null,
    });
  });

  it("joins the tier's unreadable-file reports into the scope error", () => {
    const read = readManagedScope({
      settings: null,
      source: "/etc/claude-code/managed-settings.json",
      errors: ["a could not be read.", "b could not be read."],
    });
    expect(read.error).toBe("a could not be read. b could not be read.");
  });
});

describe("readPluginSources", () => {
  it("returns a complete, well-shaped snapshot on a machine with no plugins", () => {
    // Runs against the real home directory: the assertion is on shape and on
    // not throwing, which is what this thin I/O wrapper is responsible for.
    const sources = readPluginSources();
    expect(sources.scopes.map((s) => s.scope)).toEqual(["global", "managed"]);
    expect(Array.isArray(sources.active)).toBe(true);
    expect(Array.isArray(sources.blocked)).toBe(true);
    expect(typeof sources.known).toBe("object");
  });
});
