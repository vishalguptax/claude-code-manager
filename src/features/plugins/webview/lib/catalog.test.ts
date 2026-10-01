import { describe, expect, it } from "vitest";
import { availablePlugin } from "../__tests__/fixtures";
import { buildCatalogRows, catalogByline, filterAvailable, INSTALL_SCOPES } from "./catalog";

const swift = availablePlugin();
const seo = availablePlugin({
  id: "claude-seo@agricidaniel-claude-seo",
  name: "claude-seo",
  marketplace: "agricidaniel-claude-seo",
  description: "Full website SEO audits.",
  category: "marketing",
  author: "AgriciDaniel",
});
const cave = availablePlugin({
  id: "caveman@caveman",
  name: "caveman",
  marketplace: "caveman",
  description: "Talk like caveman.",
  category: "",
  author: "",
});

describe("filterAvailable", () => {
  it("returns everything, as a copy, for a blank query", () => {
    const list = [swift, seo];
    const out = filterAvailable(list, "  ");
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
  });

  it.each([
    ["id", "SWIFT-LSP@"],
    ["description", "seo audits"],
    ["category", "marketing"],
    ["author", "agricidaniel"],
  ])("matches on %s, case-insensitively", (_field, query) => {
    expect(filterAvailable([swift, seo], query)).toHaveLength(1);
  });
});

describe("buildCatalogRows", () => {
  it("heads each marketplace's run of plugins", () => {
    const rows = buildCatalogRows([swift, cave, { ...cave, id: "grunt@caveman", name: "grunt" }]);
    expect(rows.map((r) => (r.kind === "label" ? `# ${r.marketplace}` : r.plugin.name))).toEqual([
      "# claude-plugins-official",
      "swift-lsp",
      "# caveman",
      "caveman",
      "grunt",
    ]);
  });

  it("builds nothing from nothing", () => {
    expect(buildCatalogRows([])).toEqual([]);
  });
});

describe("catalogByline", () => {
  it("joins what the catalog says, skipping what it does not", () => {
    expect(catalogByline(swift)).toBe("development · Anthropic");
    expect(catalogByline({ ...swift, author: "" })).toBe("development");
    expect(catalogByline(cave)).toBe("");
  });
});

describe("INSTALL_SCOPES", () => {
  it("offers exactly the CLI's three scopes, user first", () => {
    expect(INSTALL_SCOPES.map((s) => s.value)).toEqual(["user", "project", "local"]);
  });
});
