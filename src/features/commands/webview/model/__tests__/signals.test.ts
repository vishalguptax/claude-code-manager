import { beforeEach, describe, expect, it } from "vitest";
import type { Command } from "../../../types";
import {
  claudeCodeInstalled,
  commands,
  countByScope,
  errorMessage,
  filteredCommands,
  loading,
  resetCommandSignals,
  scopeFilter,
  searchQuery,
  selected,
} from "../signals";

function cmd(partial: Partial<Command> & Pick<Command, "name" | "scope">): Command {
  return { content: "", path: "", ...partial };
}

const SAMPLE: Command[] = [
  cmd({ name: "clear", scope: "builtin", description: "Clear conversation" }),
  cmd({ name: "review", scope: "project", content: "do a review" }),
  cmd({ name: "deploy", scope: "global", content: "ship it" }),
  cmd({ name: "yell", scope: "plugin", pluginName: "b@mkt", description: "loud" }),
  cmd({ name: "ask", scope: "plugin", pluginName: "a@mkt", content: "ask away" }),
];

describe("commands signals", () => {
  beforeEach(() => {
    resetCommandSignals();
    commands.value = SAMPLE;
  });

  it("resets all signals to defaults", () => {
    selected.value = SAMPLE[0] ?? null;
    loading.value = false;
    errorMessage.value = "boom";
    searchQuery.value = "x";
    scopeFilter.value = "global";
    claudeCodeInstalled.value = true;

    resetCommandSignals();

    expect(commands.value).toEqual([]);
    expect(selected.value).toBeNull();
    expect(loading.value).toBe(true);
    expect(errorMessage.value).toBeNull();
    expect(searchQuery.value).toBe("");
    expect(scopeFilter.value).toBe("all");
    expect(claudeCodeInstalled.value).toBe(false);
  });

  it("counts commands per scope", () => {
    expect(countByScope("builtin")).toBe(1);
    expect(countByScope("project")).toBe(1);
    expect(countByScope("global")).toBe(1);
    expect(countByScope("plugin")).toBe(2);
  });

  it("sorts by scope priority then plugin name then name", () => {
    const names = filteredCommands.value.map((c) => `${c.scope}:${c.name}`);
    expect(names).toEqual([
      "builtin:clear",
      "project:review",
      "global:deploy",
      "plugin:ask", // a@mkt before b@mkt
      "plugin:yell",
    ]);
  });

  it("filters by the active scope", () => {
    scopeFilter.value = "plugin";
    expect(filteredCommands.value.map((c) => c.name)).toEqual(["ask", "yell"]);
  });

  it("filters by search query across name, content, and description", () => {
    searchQuery.value = "review";
    expect(filteredCommands.value.map((c) => c.name)).toEqual(["review"]);

    searchQuery.value = "ship";
    expect(filteredCommands.value.map((c) => c.name)).toEqual(["deploy"]);

    searchQuery.value = "loud";
    expect(filteredCommands.value.map((c) => c.name)).toEqual(["yell"]);
  });

  it("combines scope filter and search query", () => {
    scopeFilter.value = "plugin";
    searchQuery.value = "ask";
    expect(filteredCommands.value.map((c) => c.name)).toEqual(["ask"]);
  });
});
