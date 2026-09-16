import { beforeEach, describe, expect, it } from "vitest";
import type { PromptEntry } from "../../types";
import { ALL_PROJECTS } from "../lib";
import {
  applyError,
  applyPrompts,
  errorMessage,
  loading,
  projectFilter,
  projects,
  prompts,
  resetPromptSignals,
  searchQuery,
  visiblePrompts,
} from "./signals";

function entry(over: Partial<PromptEntry> = {}): PromptEntry {
  return {
    id: "s#0",
    text: "refactor the session parser",
    timestamp: 1789543750263,
    projectPath: "/w/app",
    projectName: "app",
    sessionId: "09285b5a-1542-4940-b2a8-ef73977f6fe1",
    repeatCount: 1,
    attachmentCount: 0,
    attachmentChars: 0,
    ...over,
  };
}

// Module-level signals survive between tests in this file, so reset explicitly.
beforeEach(() => {
  resetPromptSignals();
});

describe("initial state", () => {
  it("starts empty and loading", () => {
    expect(prompts.value).toEqual([]);
    expect(loading.value).toBe(true);
    expect(visiblePrompts.value).toEqual([]);
    expect(projects.value).toEqual([]);
    expect(errorMessage.value).toBeNull();
  });
});

describe("applyPrompts", () => {
  it("stores the list and clears loading", () => {
    applyPrompts([entry()]);
    expect(prompts.value).toHaveLength(1);
    expect(loading.value).toBe(false);
  });

  it("clears a previous error", () => {
    applyError("boom");
    applyPrompts([entry()]);
    expect(errorMessage.value).toBeNull();
  });

  it("keeps a project filter the new data still contains", () => {
    projectFilter.value = "/w/app";
    applyPrompts([entry({ projectPath: "/w/app" })]);
    expect(projectFilter.value).toBe("/w/app");
  });

  it("drops a project filter the new data no longer contains", () => {
    projectFilter.value = "/w/gone";
    applyPrompts([entry({ projectPath: "/w/app" })]);
    expect(projectFilter.value).toBe(ALL_PROJECTS);
  });

  it("leaves the all-projects filter alone for an empty list", () => {
    applyPrompts([]);
    expect(projectFilter.value).toBe(ALL_PROJECTS);
    expect(loading.value).toBe(false);
  });
});

describe("applyError", () => {
  it("records the message and stops loading", () => {
    applyError("could not read history.jsonl");
    expect(errorMessage.value).toBe("could not read history.jsonl");
    expect(loading.value).toBe(false);
  });
});

describe("derived state", () => {
  beforeEach(() => {
    applyPrompts([
      entry({ id: "1", text: "refactor the parser", projectPath: "/w/a", projectName: "a" }),
      entry({ id: "2", text: "write release notes", projectPath: "/w/a", projectName: "a" }),
      entry({ id: "3", text: "parse the history file", projectPath: "/w/b", projectName: "b" }),
    ]);
  });

  it("derives the project list busiest first", () => {
    expect(projects.value.map((p) => [p.name, p.count])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("shows everything with no filters", () => {
    expect(visiblePrompts.value).toHaveLength(3);
  });

  it("narrows on the search query", () => {
    searchQuery.value = "parser";
    expect(visiblePrompts.value.map((e) => e.id)).toEqual(["1"]);
  });

  it("narrows on the project filter", () => {
    projectFilter.value = "/w/b";
    expect(visiblePrompts.value.map((e) => e.id)).toEqual(["3"]);
  });

  it("ANDs both filters", () => {
    projectFilter.value = "/w/a";
    searchQuery.value = "release";
    expect(visiblePrompts.value.map((e) => e.id)).toEqual(["2"]);
  });

  it("recomputes when the query is cleared", () => {
    searchQuery.value = "parser";
    expect(visiblePrompts.value).toHaveLength(1);
    searchQuery.value = "";
    expect(visiblePrompts.value).toHaveLength(3);
  });
});

describe("resetPromptSignals", () => {
  it("returns every signal to its initial value", () => {
    applyPrompts([entry()]);
    searchQuery.value = "x";
    projectFilter.value = "/w/app";
    applyError("bad");

    resetPromptSignals();

    expect(prompts.value).toEqual([]);
    expect(loading.value).toBe(true);
    expect(searchQuery.value).toBe("");
    expect(projectFilter.value).toBe(ALL_PROJECTS);
    expect(errorMessage.value).toBeNull();
  });
});
