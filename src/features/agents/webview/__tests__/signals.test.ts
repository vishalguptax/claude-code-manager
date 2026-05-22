import { beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "../../types";
import {
  agents,
  error,
  filteredAgents,
  filterModel,
  groupedAgents,
  loading,
  modelCounts,
  resetAgentsState,
  scopeLabel,
  searchQuery,
  selectAgent,
  selectedAgent,
  setAgents,
  setError,
} from "../signals";

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "alpha",
    description: "an agent",
    model: "sonnet",
    path: "/a/alpha.md",
    content: "body",
    scope: "global",
    ...overrides,
  };
}

beforeEach(() => {
  resetAgentsState();
});

describe("agents signals", () => {
  it("starts empty and loading", () => {
    expect(agents.value).toEqual([]);
    expect(loading.value).toBe(true);
    expect(error.value).toBeNull();
  });

  it("setAgents stores data and clears loading/error", () => {
    error.value = "stale";
    setAgents([agent()]);
    expect(agents.value).toHaveLength(1);
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it("setError records the message and clears loading", () => {
    setError("boom");
    expect(error.value).toBe("boom");
    expect(loading.value).toBe(false);
  });

  it("selectAgent toggles the detail target", () => {
    const a = agent();
    selectAgent(a);
    expect(selectedAgent.value).toBe(a);
    selectAgent(null);
    expect(selectedAgent.value).toBeNull();
  });

  it("modelCounts counts each model and total", () => {
    setAgents([
      agent({ path: "1", model: "sonnet" }),
      agent({ path: "2", model: "opus" }),
      agent({ path: "3", model: "opus" }),
      agent({ path: "4", model: "haiku" }),
    ]);
    expect(modelCounts.value).toEqual({ all: 4, sonnet: 1, opus: 2, haiku: 1 });
  });

  it("filteredAgents applies the model filter", () => {
    setAgents([
      agent({ name: "s", path: "1", model: "sonnet" }),
      agent({ name: "o", path: "2", model: "opus" }),
    ]);
    filterModel.value = "opus";
    expect(filteredAgents.value.map((a) => a.name)).toEqual(["o"]);
  });

  it("filteredAgents matches the search query across name, desc, model", () => {
    setAgents([
      agent({ name: "reviewer", path: "1", description: "reviews code" }),
      agent({ name: "scout", path: "2", description: "explores" }),
    ]);
    searchQuery.value = "review";
    expect(filteredAgents.value.map((a) => a.name)).toEqual(["reviewer"]);
    searchQuery.value = "explores";
    expect(filteredAgents.value.map((a) => a.name)).toEqual(["scout"]);
  });

  it("filteredAgents sorts project before global before plugin, then by name", () => {
    setAgents([
      agent({ name: "z", path: "1", scope: "plugin", pluginName: "p@m" }),
      agent({ name: "b", path: "2", scope: "global" }),
      agent({ name: "a", path: "3", scope: "project" }),
      agent({ name: "a", path: "4", scope: "global" }),
    ]);
    expect(filteredAgents.value.map((a) => `${a.scope}:${a.name}`)).toEqual([
      "project:a",
      "global:a",
      "global:b",
      "plugin:z",
    ]);
  });

  it("scopeLabel describes each scope", () => {
    expect(scopeLabel(agent({ scope: "project" }))).toBe("Project");
    expect(scopeLabel(agent({ scope: "global" }))).toBe("Global");
    expect(scopeLabel(agent({ scope: "plugin", pluginName: "p@m" }))).toBe("Plugin: p@m");
    expect(scopeLabel(agent({ scope: "plugin", pluginName: undefined }))).toBe("Plugin: unknown");
  });

  it("groupedAgents buckets the filtered list by scope label in order", () => {
    setAgents([
      agent({ name: "g", path: "1", scope: "global" }),
      agent({ name: "p", path: "2", scope: "project" }),
      agent({ name: "x", path: "3", scope: "plugin", pluginName: "p@m" }),
    ]);
    const groups = groupedAgents.value;
    expect(groups.map((g) => g.label)).toEqual(["Project", "Global", "Plugin: p@m"]);
    expect(groups[0]?.items.map((a) => a.name)).toEqual(["p"]);
  });

  it("resetAgentsState clears everything", () => {
    setAgents([agent()]);
    selectAgent(agent());
    searchQuery.value = "q";
    filterModel.value = "opus";
    resetAgentsState();
    expect(agents.value).toEqual([]);
    expect(selectedAgent.value).toBeNull();
    expect(searchQuery.value).toBe("");
    expect(filterModel.value).toBe("all");
    expect(loading.value).toBe(true);
  });
});
