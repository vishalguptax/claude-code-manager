import { beforeEach, describe, expect, it } from "vitest";
import {
  blocked,
  notEnabled,
  orphaned,
  plugin,
  policyEntry,
  snapshot,
  untrusted,
} from "../__tests__/fixtures";
import {
  _resetPluginsState,
  applyPluginsData,
  ignoredPolicy,
  isIssue,
  issues,
  loading,
  marketplaces,
  parseErrors,
  plugins,
  policy,
  searchQuery,
  view,
  viewCounts,
  visibleMarketplaces,
  visiblePlugins,
} from "./signals";

beforeEach(() => _resetPluginsState());

describe("applyPluginsData", () => {
  it("fills every signal and clears the loading flag", () => {
    applyPluginsData(snapshot());
    expect(plugins.value).toHaveLength(5);
    expect(marketplaces.value).toHaveLength(2);
    expect(policy.value).toHaveLength(1);
    expect(loading.value).toBe(false);
  });

  it("carries parse errors through to the banner signal", () => {
    applyPluginsData(snapshot({ errors: ["/repo/.claude/settings.json could not be read"] }));
    expect(parseErrors.value).toEqual(["/repo/.claude/settings.json could not be read"]);
  });

  it("handles an empty snapshot", () => {
    applyPluginsData({ plugins: [], marketplaces: [], policy: [], errors: [] });
    expect(plugins.value).toEqual([]);
    expect(loading.value).toBe(false);
  });
});

describe("isIssue", () => {
  it("counts the three disagreements plus an untrusted source", () => {
    expect(isIssue(notEnabled)).toBe(true);
    expect(isIssue(orphaned)).toBe(true);
    expect(isIssue(blocked)).toBe(true);
    expect(isIssue(untrusted)).toBe(true);
  });

  it("leaves a healthy plugin alone", () => {
    expect(isIssue(plugin())).toBe(false);
    expect(isIssue(plugin({ status: "disabled", enabled: false }))).toBe(false);
  });
});

describe("visiblePlugins", () => {
  it("shows everything in the all view", () => {
    applyPluginsData(snapshot());
    expect(visiblePlugins.value).toHaveLength(5);
  });

  it("narrows to the findings in the issues view", () => {
    applyPluginsData(snapshot());
    view.value = "issues";
    expect(visiblePlugins.value.map((p) => p.id)).toEqual([
      notEnabled.id,
      orphaned.id,
      untrusted.id,
      blocked.id,
    ]);
  });

  it("searches id, description and marketplace", () => {
    applyPluginsData(snapshot());
    searchQuery.value = "caveman";
    expect(visiblePlugins.value.map((p) => p.id)).toEqual(["caveman@caveman", "banned@caveman"]);

    searchQuery.value = "65%";
    expect(visiblePlugins.value.map((p) => p.id)).toEqual(["caveman@caveman"]);
  });

  it("combines the issues view with the query", () => {
    applyPluginsData(snapshot());
    view.value = "issues";
    searchQuery.value = "caveman";
    expect(visiblePlugins.value.map((p) => p.id)).toEqual(["banned@caveman"]);
  });

  it("returns nothing for a query that matches nothing", () => {
    applyPluginsData(snapshot());
    searchQuery.value = "zzz";
    expect(visiblePlugins.value).toEqual([]);
  });
});

describe("visibleMarketplaces", () => {
  it("searches name and source label", () => {
    applyPluginsData(snapshot());
    searchQuery.value = "juliusbrussee";
    expect(visibleMarketplaces.value.map((m) => m.name)).toEqual(["caveman"]);
  });

  it("returns all marketplaces with no query", () => {
    applyPluginsData(snapshot());
    expect(visibleMarketplaces.value).toHaveLength(2);
  });
});

describe("viewCounts", () => {
  it("counts each segment, and issues agrees with the issues list", () => {
    applyPluginsData(snapshot());
    expect(viewCounts.value).toEqual({ all: 5, issues: 4, sources: 2 });
    expect(issues.value).toHaveLength(viewCounts.value.issues);
  });

  it("is all zeroes before any snapshot arrives", () => {
    expect(viewCounts.value).toEqual({ all: 0, issues: 0, sources: 0 });
  });
});

describe("ignoredPolicy", () => {
  it("picks out the keys Claude Code will silently disregard", () => {
    applyPluginsData(
      snapshot({
        policy: [
          policyEntry(),
          policyEntry({ key: "blockedMarketplaces", scope: "global", ignored: true }),
        ],
      }),
    );
    expect(ignoredPolicy.value.map((p) => p.key)).toEqual(["blockedMarketplaces"]);
  });
});

describe("_resetPluginsState", () => {
  it("returns every signal to its initial value", () => {
    applyPluginsData(snapshot());
    searchQuery.value = "x";
    view.value = "sources";
    _resetPluginsState();
    expect(plugins.value).toEqual([]);
    expect(loading.value).toBe(true);
    expect(searchQuery.value).toBe("");
    expect(view.value).toBe("all");
  });
});
