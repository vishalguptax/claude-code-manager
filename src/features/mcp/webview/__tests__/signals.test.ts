import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "../../types";
import {
  applyError,
  applyServers,
  errorMessage,
  filteredServers,
  groupLabel,
  loading,
  resetMcpSignals,
  scopeCounts,
  scopeFilter,
  searchQuery,
  selected,
  servers,
} from "../signals";

function srv(partial: Partial<McpServer> & Pick<McpServer, "name" | "scope">): McpServer {
  return { type: "stdio", command: "x", ...partial };
}

afterEach(() => resetMcpSignals());

describe("applyServers", () => {
  it("populates servers and clears loading + error", () => {
    loading.value = true;
    errorMessage.value = "boom";
    applyServers([srv({ name: "a", scope: "global" })]);
    expect(servers.value).toHaveLength(1);
    expect(loading.value).toBe(false);
    expect(errorMessage.value).toBeNull();
  });

  it("refreshes the selection to the new reference when it still exists", () => {
    const before = srv({ name: "a", scope: "project", disabled: true });
    applyServers([before]);
    selected.value = before;
    const after = srv({ name: "a", scope: "project" });
    applyServers([after]);
    expect(selected.value).toBe(after);
    expect(selected.value?.disabled).toBeUndefined();
  });

  it("drops the selection when the selected server disappears", () => {
    const sel = srv({ name: "gone", scope: "project" });
    applyServers([sel]);
    selected.value = sel;
    applyServers([srv({ name: "other", scope: "project" })]);
    expect(selected.value).toBeNull();
  });
});

describe("applyError", () => {
  it("records the message and stops loading", () => {
    loading.value = true;
    applyError("nope");
    expect(errorMessage.value).toBe("nope");
    expect(loading.value).toBe(false);
  });
});

describe("scopeCounts", () => {
  it("counts servers per scope", () => {
    applyServers([
      srv({ name: "a", scope: "project" }),
      srv({ name: "b", scope: "global" }),
      srv({ name: "c", scope: "global" }),
      srv({ name: "d", scope: "plugin", pluginName: "p@m" }),
    ]);
    expect(scopeCounts.value).toEqual({ project: 1, global: 2, plugin: 1 });
  });
});

describe("filteredServers", () => {
  it("sorts project → global → plugin then by name", () => {
    applyServers([
      srv({ name: "zeta", scope: "global" }),
      srv({ name: "beta", scope: "plugin", pluginName: "p@m" }),
      srv({ name: "alpha", scope: "project" }),
      srv({ name: "alpha", scope: "global" }),
    ]);
    expect(filteredServers.value.map((s) => `${s.scope}:${s.name}`)).toEqual([
      "project:alpha",
      "global:alpha",
      "global:zeta",
      "plugin:beta",
    ]);
  });

  it("filters by the active scope", () => {
    applyServers([
      srv({ name: "a", scope: "project" }),
      srv({ name: "b", scope: "global" }),
    ]);
    scopeFilter.value = "global";
    expect(filteredServers.value.map((s) => s.name)).toEqual(["b"]);
  });

  it("filters by query across name, type, command, and url", () => {
    applyServers([
      srv({ name: "files", scope: "project", command: "fs-mcp" }),
      srv({ name: "remote", scope: "global", type: "http", url: "https://api.example.com" }),
    ]);
    searchQuery.value = "example.com";
    expect(filteredServers.value.map((s) => s.name)).toEqual(["remote"]);
    searchQuery.value = "fs-mcp";
    expect(filteredServers.value.map((s) => s.name)).toEqual(["files"]);
    searchQuery.value = "http";
    expect(filteredServers.value.map((s) => s.name)).toEqual(["remote"]);
  });
});

describe("groupLabel", () => {
  it("labels by scope, naming the plugin for plugin servers", () => {
    expect(groupLabel(srv({ name: "a", scope: "project" }))).toBe("Project Servers");
    expect(groupLabel(srv({ name: "a", scope: "global" }))).toBe("Global Servers");
    expect(groupLabel(srv({ name: "a", scope: "plugin", pluginName: "p@m" }))).toBe(
      "Plugin: p@m",
    );
    expect(groupLabel(srv({ name: "a", scope: "plugin" }))).toBe("Plugin: unknown");
  });
});
