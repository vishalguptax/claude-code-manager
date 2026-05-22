import { afterEach, describe, expect, it } from "vitest";
import type { McpServer } from "../../types";
import {
  applyError,
  applyServers,
  errorMessage,
  filteredServers,
  loading,
  resetMcpSignals,
  scopeCounts,
  scopeFilter,
  searchQuery,
  selected,
  servers,
} from "./signals";

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

  it("orders plugin rows by plugin name then server name", () => {
    applyServers([
      srv({ name: "b", scope: "plugin", pluginName: "zeta" }),
      srv({ name: "a", scope: "plugin", pluginName: "alpha" }),
    ]);
    expect(filteredServers.value.map((s) => s.pluginName)).toEqual(["alpha", "zeta"]);
  });

  it("filters by the active scope", () => {
    applyServers([srv({ name: "a", scope: "project" }), srv({ name: "b", scope: "global" })]);
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

describe("resetMcpSignals", () => {
  it("returns every signal to its initial value", () => {
    applyServers([srv({ name: "a", scope: "project" })]);
    selected.value = servers.value[0];
    searchQuery.value = "x";
    scopeFilter.value = "global";
    resetMcpSignals();
    expect(servers.value).toEqual([]);
    expect(selected.value).toBeNull();
    expect(loading.value).toBe(true);
    expect(errorMessage.value).toBeNull();
    expect(searchQuery.value).toBe("");
    expect(scopeFilter.value).toBe("all");
  });
});
