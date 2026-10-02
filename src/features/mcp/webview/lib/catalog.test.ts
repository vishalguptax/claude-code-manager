import { describe, expect, it } from "vitest";
import {
  MCP_CATALOG,
  catalogAuthHint,
  catalogPreset,
  configuredNames,
  filterCatalog,
  type McpCatalogEntry,
} from "./catalog";

/** The Add form's own name rule — a catalog name it rejects could never be saved. */
const MCP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function entry(name: string): McpCatalogEntry {
  const found = MCP_CATALOG.find((e) => e.name === name);
  if (!found) throw new Error(`no catalog entry "${name}"`);
  return found;
}

describe("MCP_CATALOG", () => {
  it("gives every entry a unique name the Add form accepts", () => {
    const names = MCP_CATALOG.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(MCP_NAME_RE);
  });

  it("pairs each transport with exactly the connection fields it uses", () => {
    for (const e of MCP_CATALOG) {
      if (e.transport === "stdio") {
        expect(e.command, e.name).toBeTruthy();
        expect(e.url, e.name).toBeUndefined();
        expect(e.headers, e.name).toBeUndefined();
      } else {
        expect(e.url, e.name).toMatch(/^https:\/\//);
        expect(e.command, e.name).toBeUndefined();
        expect(e.args, e.name).toBeUndefined();
      }
    }
  });

  it("links every entry to an https setup page", () => {
    for (const e of MCP_CATALOG) expect(e.homepage, e.name).toMatch(/^https:\/\//);
  });

  // A token must reach the server through an environment reference, never a
  // literal: the config file it lands in may be committed.
  it("references a token server's variable instead of embedding a secret", () => {
    const tokenServers = MCP_CATALOG.filter((e) => e.auth === "token");
    expect(tokenServers.length).toBeGreaterThan(0);
    for (const e of tokenServers) {
      expect(e.tokenEnv, e.name).toBeTruthy();
      const values = Object.values(e.headers ?? {}).join(" ");
      expect(values, e.name).toContain(`\${${e.tokenEnv}}`);
    }
  });

  it("names a token variable only on token servers", () => {
    for (const e of MCP_CATALOG.filter((x) => x.auth !== "token")) {
      expect(e.tokenEnv, e.name).toBeUndefined();
    }
  });
});

describe("filterCatalog", () => {
  it("returns every entry for a blank query, as a copy", () => {
    const all = filterCatalog(MCP_CATALOG, "  ");
    expect(all).toEqual([...MCP_CATALOG]);
    expect(all).not.toBe(MCP_CATALOG);
  });

  it("matches the title case-insensitively", () => {
    expect(filterCatalog(MCP_CATALOG, "PLAYWR").map((e) => e.name)).toEqual(["playwright"]);
  });

  it("matches the description", () => {
    const names = filterCatalog(MCP_CATALOG, "stack traces").map((e) => e.name);
    expect(names).toEqual(["sentry"]);
  });

  it("matches the config name", () => {
    expect(filterCatalog(MCP_CATALOG, "chrome-dev").map((e) => e.name)).toEqual([
      "chrome-devtools",
    ]);
  });

  it("returns nothing when no entry matches", () => {
    expect(filterCatalog(MCP_CATALOG, "zzz-no-such-server")).toEqual([]);
  });
});

describe("configuredNames", () => {
  it("collects names across scopes, once each", () => {
    const names = configuredNames([{ name: "github" }, { name: "github" }, { name: "local" }]);
    expect([...names].sort()).toEqual(["github", "local"]);
  });
});

describe("catalogAuthHint", () => {
  it("sends an OAuth server's user to /mcp to sign in", () => {
    expect(catalogAuthHint(entry("sentry"))).toBe("Sign in from /mcp after adding.");
  });

  it("names the environment variable a token server reads", () => {
    expect(catalogAuthHint(entry("github"))).toBe(
      "Reads GITHUB_PERSONAL_ACCESS_TOKEN from your environment.",
    );
  });

  it("has nothing to say for a server that needs no account", () => {
    expect(catalogAuthHint(entry("playwright"))).toBeNull();
  });
});

describe("catalogPreset", () => {
  it("carries the connection fields and the hint", () => {
    const preset = catalogPreset(entry("github"));
    expect(preset.input).toEqual({
      name: "github",
      transport: "http",
      command: undefined,
      args: undefined,
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" },
    });
    expect(preset.note).toBe("Reads GITHUB_PERSONAL_ACCESS_TOKEN from your environment.");
  });

  it("copies args and headers so editing the form cannot mutate the catalog", () => {
    const source = entry("playwright");
    const preset = catalogPreset(source);
    preset.input.args?.push("--headless");
    expect(source.args).toEqual(["@playwright/mcp@latest"]);

    const gh = catalogPreset(entry("github"));
    if (gh.input.headers) gh.input.headers.Authorization = "changed";
    expect(entry("github").headers?.Authorization).toBe("Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}");
  });
});
