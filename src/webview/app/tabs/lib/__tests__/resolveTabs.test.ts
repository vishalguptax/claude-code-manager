import { describe, expect, it } from "vitest";
import type { Feature } from "../../tabRegistry";
import { resolveVisibleTabs } from "../resolveTabs";

const ALL: Feature[] = [
  { id: "sessions", label: "Sessions", icon: "message-square" },
  { id: "skills", label: "Skills", icon: "sparkles" },
  { id: "mcp", label: "MCP", icon: "plug" },
  { id: "account", label: "Account", icon: "circle-user" },
  { id: "config", label: "Config", icon: "settings" },
];

const ids = (tabs: Feature[]): string[] => tabs.map((t) => t.id);

describe("resolveVisibleTabs", () => {
  it("returns every tab, in registry order, when nothing is configured", () => {
    expect(ids(resolveVisibleTabs(ALL, [], []))).toEqual([
      "sessions",
      "skills",
      "mcp",
      "account",
      "config",
    ]);
  });

  describe("ordering", () => {
    it("moves the listed ids to the front, in the order given", () => {
      expect(ids(resolveVisibleTabs(ALL, [], ["config", "account"]))).toEqual([
        "config",
        "account",
        "sessions",
        "skills",
        "mcp",
      ]);
    });

    it("appends everything left out after the listed ids, in its original order", () => {
      const result = ids(resolveVisibleTabs(ALL, [], ["mcp"]));
      expect(result).toEqual(["mcp", "sessions", "skills", "account", "config"]);
    });

    it("drops an id that names no real tab, without disturbing the rest", () => {
      expect(ids(resolveVisibleTabs(ALL, [], ["config", "not-a-real-tab", "account"]))).toEqual([
        "config",
        "account",
        "sessions",
        "skills",
        "mcp",
      ]);
    });

    it("counts a repeated id only at its first occurrence", () => {
      expect(ids(resolveVisibleTabs(ALL, [], ["account", "account", "config"]))).toEqual([
        "account",
        "config",
        "sessions",
        "skills",
        "mcp",
      ]);
    });

    it("is a no-op for an empty order list", () => {
      expect(ids(resolveVisibleTabs(ALL, [], []))).toEqual(ids(ALL));
    });

    it("full reorder: an order naming every tab is honoured exactly", () => {
      const full = ["config", "account", "mcp", "skills", "sessions"];
      expect(ids(resolveVisibleTabs(ALL, [], full))).toEqual(full);
    });
  });

  describe("hiding", () => {
    it("removes the named tabs", () => {
      expect(ids(resolveVisibleTabs(ALL, ["skills", "mcp"], []))).toEqual([
        "sessions",
        "account",
        "config",
      ]);
    });

    it("ignores a hidden id that names no real tab", () => {
      expect(ids(resolveVisibleTabs(ALL, ["not-a-real-tab"], []))).toEqual(ids(ALL));
    });

    it("falls back to showing everything rather than hiding every tab", () => {
      // The safety net this function exists for: a settings.json that
      // hides every current tab (by hand, or because a future release
      // renamed them all) must not leave the panel blank.
      const allIds = ALL.map((t) => t.id);
      expect(ids(resolveVisibleTabs(ALL, allIds, []))).toEqual(allIds);
    });

    it("falls back even when the hidden list only matches via unknown ids plus every real one", () => {
      const allIds = ALL.map((t) => t.id);
      expect(ids(resolveVisibleTabs(ALL, [...allIds, "not-a-real-tab"], []))).toEqual(allIds);
    });

    it("does not fall back when at least one tab survives", () => {
      const allButOne = ALL.filter((t) => t.id !== "sessions").map((t) => t.id);
      expect(ids(resolveVisibleTabs(ALL, allButOne, []))).toEqual(["sessions"]);
    });
  });

  describe("ordering and hiding together", () => {
    it("hides AFTER reordering, so a hidden tab's slot in the order is simply skipped", () => {
      const result = ids(resolveVisibleTabs(ALL, ["account"], ["config", "account", "mcp"]));
      expect(result).toEqual(["config", "mcp", "sessions", "skills"]);
    });

    it("falls back to the ORDERED list, not the raw registry, when hiding empties it", () => {
      const custom = ["config", "account", "sessions", "skills", "mcp"];
      const allIds = ALL.map((t) => t.id);
      expect(ids(resolveVisibleTabs(ALL, allIds, custom))).toEqual(custom);
    });
  });

  it("never mutates the input array", () => {
    const before = [...ALL];
    resolveVisibleTabs(ALL, ["skills"], ["config", "account"]);
    expect(ALL).toEqual(before);
  });
});
