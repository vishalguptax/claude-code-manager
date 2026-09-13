import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetPaletteSources,
  collectPaletteItems,
  PALETTE_LIMIT,
  type PaletteItem,
  registerPaletteSource,
  scoreItem,
} from "../palette";

function item(over: Partial<PaletteItem> = {}): PaletteItem {
  return { id: "i", title: "Thing", group: "Group", run: () => {}, ...over };
}

beforeEach(() => {
  _resetPaletteSources();
});

describe("scoreItem", () => {
  // The ranking is deliberately three bands, because a palette that reorders
  // in ways the user cannot predict is worse than one that does not rank.
  it("ranks a title prefix above a title substring above a subtitle match", () => {
    expect(scoreItem(item({ title: "quota bar" }), "quota")).toBe(3);
    expect(scoreItem(item({ title: "live quota bar" }), "quota")).toBe(2);
    expect(scoreItem(item({ title: "bar", subtitle: "quota" }), "quota")).toBe(1);
  });

  it("returns 0 when nothing matches", () => {
    expect(scoreItem(item({ title: "bar", subtitle: "baz" }), "quota")).toBe(0);
  });

  it("matches case-insensitively", () => {
    expect(scoreItem(item({ title: "Quota Bar" }), "quota")).toBe(3);
  });

  // Deliberate: subsequence matching turns a specific query into a page of
  // near-misses, and every one of these lists is exact-searchable in its tab.
  it("does not fuzzy-match a subsequence", () => {
    expect(scoreItem(item({ title: "quota bar" }), "qtb")).toBe(0);
  });
});

describe("collectPaletteItems", () => {
  it("returns nothing when no source is registered", () => {
    expect(collectPaletteItems("")).toEqual([]);
  });

  // Opening the palette should show what is available, not a blank box.
  it("returns everything for an empty query", () => {
    registerPaletteSource("a", () => [item({ id: "1" }), item({ id: "2" })]);
    expect(collectPaletteItems("").length).toBe(2);
  });

  it("filters to matches and drops the rest", () => {
    registerPaletteSource("a", () => [
      item({ id: "1", title: "quota bar" }),
      item({ id: "2", title: "heatmap" }),
    ]);
    expect(collectPaletteItems("quota").map((i) => i.id)).toEqual(["1"]);
  });

  it("orders better matches first, across sources", () => {
    registerPaletteSource("a", () => [item({ id: "sub", title: "x", subtitle: "quota" })]);
    registerPaletteSource("b", () => [item({ id: "prefix", title: "quota bar" })]);
    expect(collectPaletteItems("quota").map((i) => i.id)).toEqual(["prefix", "sub"]);
  });

  // The renderer emits a heading wherever the group changes, so a group split
  // across the output would print its heading twice.
  it("keeps each group contiguous", () => {
    registerPaletteSource("a", () => [
      item({ id: "s1", title: "quota alpha", group: "Sessions" }),
      item({ id: "k1", title: "quota beta", group: "Skills" }),
      item({ id: "s2", title: "beta quota", group: "Sessions" }),
    ]);
    const groups = collectPaletteItems("quota").map((i) => i.group);
    expect(groups).toEqual(["Sessions", "Sessions", "Skills"]);
  });

  it("caps the result count", () => {
    registerPaletteSource("a", () =>
      Array.from({ length: PALETTE_LIMIT + 25 }, (_, i) => item({ id: `i${i}` })),
    );
    expect(collectPaletteItems("").length).toBe(PALETTE_LIMIT);
  });

  // A feature whose signals are mid-update must not take the whole palette
  // down with it; its items are simply absent from that query.
  it("skips a source that throws instead of failing the query", () => {
    registerPaletteSource("bad", () => {
      throw new Error("mid-update");
    });
    registerPaletteSource("good", () => [item({ id: "ok" })]);
    expect(collectPaletteItems("").map((i) => i.id)).toEqual(["ok"]);
  });

  it("stops including a source once it unregisters", () => {
    const off = registerPaletteSource("a", () => [item({ id: "1" })]);
    expect(collectPaletteItems("").length).toBe(1);
    off();
    expect(collectPaletteItems("").length).toBe(0);
  });

  // Tabs stay mounted, but a remount would register twice and every item would
  // appear in duplicate. Registering under the same id replaces.
  it("replaces a source registered twice under one id", () => {
    registerPaletteSource("a", () => [item({ id: "old" })]);
    registerPaletteSource("a", () => [item({ id: "new" })]);
    expect(collectPaletteItems("").map((i) => i.id)).toEqual(["new"]);
  });

  // A stale unsubscribe from the previous mount must not delete the live
  // registration the new mount just installed.
  it("ignores a stale unsubscribe after re-registration", () => {
    const stale = registerPaletteSource("a", () => [item({ id: "old" })]);
    registerPaletteSource("a", () => [item({ id: "new" })]);
    stale();
    expect(collectPaletteItems("").map((i) => i.id)).toEqual(["new"]);
  });

  // The source is a function, not a snapshot, so a feature never has to push
  // an update when its signals change.
  it("reads the source fresh on every query", () => {
    let live = [item({ id: "1" })];
    const source = vi.fn(() => live);
    registerPaletteSource("a", source);
    expect(collectPaletteItems("").length).toBe(1);
    live = [item({ id: "1" }), item({ id: "2" })];
    expect(collectPaletteItems("").length).toBe(2);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("trims the query so a trailing space is not a failed search", () => {
    registerPaletteSource("a", () => [item({ id: "1", title: "quota" })]);
    expect(collectPaletteItems("  quota  ").length).toBe(1);
  });
});
