import * as path from "path";
import { describe, expect, it } from "vitest";
import { buildAvailablePlugins, catalogPath, parseCatalog, type RawCatalogPlugin } from "../catalog";
import type { MarketplaceTrust } from "../types";

const OFFICIAL = "claude-plugins-official";

function offer(name: string): RawCatalogPlugin {
  return { name, description: "", category: "", author: "", homepage: "" };
}

describe("catalogPath", () => {
  it("points at the documented catalog inside a clone", () => {
    expect(catalogPath("/mkt/expo")).toBe(path.join("/mkt/expo", ".claude-plugin", "marketplace.json"));
  });
});

describe("parseCatalog", () => {
  // Shapes from a real claude-plugins-official clone: author is an object
  // on most entries and absent on the rest; category is sometimes missing.
  it("reads the real entry shape", () => {
    const parsed = parseCatalog({
      plugins: [
        {
          name: "agent-sdk-dev",
          description: "Development kit for working with the Claude Agent SDK",
          author: { name: "Anthropic", email: "support@anthropic.com" },
          source: "./plugins/agent-sdk-dev",
          category: "development",
          homepage: "https://github.com/anthropics/claude-plugins-public",
        },
        { name: "plain", description: "No author", source: { source: "url", url: "x" } },
      ],
    });
    expect(parsed).toEqual([
      {
        name: "agent-sdk-dev",
        description: "Development kit for working with the Claude Agent SDK",
        category: "development",
        author: "Anthropic",
        homepage: "https://github.com/anthropics/claude-plugins-public",
      },
      { name: "plain", description: "No author", category: "", author: "", homepage: "" },
    ]);
  });

  it("keeps only an https homepage — the link opens in the browser", () => {
    const parsed = parseCatalog({
      plugins: [
        { name: "a", homepage: "http://example.com" },
        { name: "b", homepage: "javascript:alert(1)" },
        { name: "c", homepage: "file:///etc/passwd" },
      ],
    });
    expect(parsed.map((p) => p.homepage)).toEqual(["", "", ""]);
  });

  it("skips entries that are not objects or have no name, keeping the rest", () => {
    const parsed = parseCatalog({
      plugins: [null, "str", [], { description: "nameless" }, { name: "  " }, { name: "ok" }],
    });
    expect(parsed.map((p) => p.name)).toEqual(["ok"]);
  });

  it("reads a catalog with no plugins array as empty", () => {
    expect(parseCatalog({ name: "mkt" })).toEqual([]);
    expect(parseCatalog({ plugins: "nope" })).toEqual([]);
  });
});

describe("buildAvailablePlugins", () => {
  const trust = (entries: Record<string, MarketplaceTrust>) => new Map(Object.entries(entries));

  it("skips an entry whose name could not be typed into a shell unquoted", () => {
    const list = buildAvailablePlugins(
      { mkt: [offer("fine"), offer("bad;rm -rf"), offer("$(id)")] },
      trust({ mkt: "known" }),
      new Set(),
      new Set(),
      OFFICIAL,
    );
    expect(list.map((p) => p.id)).toEqual(["fine@mkt"]);
  });

  it("lists a name a catalog repeats once", () => {
    const list = buildAvailablePlugins(
      { mkt: [offer("dup"), offer("dup")] },
      trust({ mkt: "known" }),
      new Set(),
      new Set(),
      OFFICIAL,
    );
    expect(list).toHaveLength(1);
  });

  it("offers only marketplaces Claude Code will install from", () => {
    const catalogs = Object.fromEntries(
      ["official", "allowlisted", "known", "unlisted", "blocked", "unknown"].map((t) => [t, [offer("p")]]),
    );
    const list = buildAvailablePlugins(
      catalogs,
      trust({
        official: "official",
        allowlisted: "allowlisted",
        known: "known",
        unlisted: "unlisted",
        blocked: "blocked",
        unknown: "unknown",
      }),
      new Set(),
      new Set(),
      OFFICIAL,
    );
    expect(list.map((p) => p.marketplace).sort()).toEqual(["allowlisted", "known", "official"]);
  });

  it("sorts the official marketplace first, then by marketplace and name", () => {
    const list = buildAvailablePlugins(
      { zeta: [offer("b"), offer("a")], [OFFICIAL]: [offer("z")], alpha: [offer("m")] },
      trust({ zeta: "known", [OFFICIAL]: "official", alpha: "known" }),
      new Set(),
      new Set(),
      OFFICIAL,
    );
    expect(list.map((p) => p.id)).toEqual([`z@${OFFICIAL}`, "m@alpha", "a@zeta", "b@zeta"]);
  });
});
