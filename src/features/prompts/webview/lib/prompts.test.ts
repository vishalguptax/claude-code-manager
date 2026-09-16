import { describe, expect, it } from "vitest";
import type { PromptEntry } from "../../types";
import {
  ALL_PROJECTS,
  buildHaystacks,
  filterPrompts,
  listPromptProjects,
  queryTerms,
} from "./prompts";

function entry(over: Partial<PromptEntry> = {}): PromptEntry {
  return {
    id: "s#0",
    text: "refactor the session parser",
    timestamp: 1789543750263,
    projectPath: "/w/claude-code-manager",
    projectName: "claude-code-manager",
    sessionId: "09285b5a-1542-4940-b2a8-ef73977f6fe1",
    repeatCount: 1,
    attachmentCount: 0,
    attachmentChars: 0,
    ...over,
  };
}

describe("listPromptProjects", () => {
  it("returns nothing for an empty list", () => {
    expect(listPromptProjects([])).toEqual([]);
  });

  it("counts prompts per project, busiest first", () => {
    const projects = listPromptProjects([
      entry({ projectPath: "/w/a", projectName: "a" }),
      entry({ projectPath: "/w/b", projectName: "b" }),
      entry({ projectPath: "/w/b", projectName: "b" }),
    ]);
    expect(projects).toEqual([
      { path: "/w/b", name: "b", count: 2 },
      { path: "/w/a", name: "a", count: 1 },
    ]);
  });

  it("breaks count ties alphabetically so the order is stable", () => {
    const projects = listPromptProjects([
      entry({ projectPath: "/w/zeta", projectName: "zeta" }),
      entry({ projectPath: "/w/alpha", projectName: "alpha" }),
    ]);
    expect(projects.map((p) => p.name)).toEqual(["alpha", "zeta"]);
  });

  it("keeps two checkouts of the same folder name apart", () => {
    const projects = listPromptProjects([
      entry({ projectPath: "/w/one/app", projectName: "app" }),
      entry({ projectPath: "/w/two/app", projectName: "app" }),
    ]);
    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.path).sort()).toEqual(["/w/one/app", "/w/two/app"]);
  });

  it("skips prompts with no recorded project", () => {
    expect(listPromptProjects([entry({ projectPath: "", projectName: "" })])).toEqual([]);
  });

  it("falls back to the path when the name is empty", () => {
    const projects = listPromptProjects([entry({ projectPath: "/w/x", projectName: "" })]);
    expect(projects[0].name).toBe("/w/x");
  });
});

describe("buildHaystacks", () => {
  it("lowercases the prompt and its project name", () => {
    expect(buildHaystacks([entry({ text: "FIX The Bug", projectName: "MyApp" })])).toEqual([
      "fix the bug\nmyapp",
    ]);
  });

  it("stays index-aligned with the entries", () => {
    expect(buildHaystacks([entry({ text: "a" }), entry({ text: "b" })])).toHaveLength(2);
  });

  it("separates the fields so a query cannot match across them", () => {
    const [haystack] = buildHaystacks([entry({ text: "run", projectName: "ner" })]);
    expect(haystack.includes("runner")).toBe(false);
  });
});

describe("queryTerms", () => {
  it("splits on whitespace and lowercases", () => {
    expect(queryTerms("  Parser   CACHE ")).toEqual(["parser", "cache"]);
  });

  it("returns nothing for a blank query", () => {
    expect(queryTerms("")).toEqual([]);
    expect(queryTerms("   ")).toEqual([]);
  });
});

describe("filterPrompts", () => {
  const entries = [
    entry({ id: "1", text: "refactor the parser cache", projectPath: "/w/a", projectName: "a" }),
    entry({ id: "2", text: "write the release notes", projectPath: "/w/a", projectName: "a" }),
    entry({ id: "3", text: "cache the parser output", projectPath: "/w/b", projectName: "b" }),
  ];
  const haystacks = buildHaystacks(entries);

  it("returns the same array when nothing is filtered", () => {
    // Identity, not just equality: an unfiltered list must not allocate a copy
    // on every unrelated signal change.
    expect(filterPrompts(entries, haystacks, "", ALL_PROJECTS)).toBe(entries);
  });

  it("requires every query term, in any order", () => {
    expect(filterPrompts(entries, haystacks, "parser cache", ALL_PROJECTS).map((e) => e.id)).toEqual(
      ["1", "3"],
    );
    expect(filterPrompts(entries, haystacks, "cache parser", ALL_PROJECTS).map((e) => e.id)).toEqual(
      ["1", "3"],
    );
  });

  it("is case-insensitive", () => {
    expect(filterPrompts(entries, haystacks, "RELEASE", ALL_PROJECTS).map((e) => e.id)).toEqual([
      "2",
    ]);
  });

  it("matches on the project name too", () => {
    expect(filterPrompts(entries, haystacks, "b", ALL_PROJECTS).map((e) => e.id)).toEqual(["3"]);
  });

  it("filters by project path alone", () => {
    expect(filterPrompts(entries, haystacks, "", "/w/b").map((e) => e.id)).toEqual(["3"]);
  });

  it("ANDs the project filter with the query", () => {
    expect(filterPrompts(entries, haystacks, "parser", "/w/a").map((e) => e.id)).toEqual(["1"]);
  });

  it("returns nothing when no prompt matches", () => {
    expect(filterPrompts(entries, haystacks, "nonexistent", ALL_PROJECTS)).toEqual([]);
  });

  it("preserves the host's newest-first order", () => {
    expect(filterPrompts(entries, haystacks, "the", ALL_PROJECTS).map((e) => e.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("handles an empty list", () => {
    expect(filterPrompts([], [], "anything", ALL_PROJECTS)).toEqual([]);
  });

  it("does not throw when a haystack is missing for an index", () => {
    expect(filterPrompts(entries, [], "parser", ALL_PROJECTS)).toEqual([]);
  });
});
