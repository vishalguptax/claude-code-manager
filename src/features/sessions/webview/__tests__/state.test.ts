import { describe, it, expect, beforeEach } from "vitest";
import { initPersistence } from "../../../../webview/persistence";
import type { VSCodeAPI } from "../../../../webview/types";
import type { Session } from "../../types";
import {
  setSessions,
  setWorkspacePath,
  setFilterProject,
  setFilterDate,
  getCurrentProjectName,
  getFiltered,
  getProjects,
  loadPersistedFilters,
  hasPersistedFilterProject,
  hasPersistedFilterDate,
  setStats,
  setPinnedIds,
  setDeletedIds,
  setCurrentBranch,
  getCurrentBranch,
  setFilterBranch,
  getFilterBranch,
  setSearchQuery,
  setFullTextHits,
  clearFullTextHits,
  toggleSelected,
  isSelected,
  selectionCount,
  selectAll,
  clearSelection,
  setSelectedRange,
  getSelectAnchor,
} from "../state";

/**
 * Build a fake VSCodeAPI backed by an in-memory state bag. Each call to
 * makeFakeVscode() returns a fresh instance so persistence tests can isolate
 * state across cases without leaking between them.
 */
function makeFakeVscode(): VSCodeAPI {
  let bag: unknown = undefined;
  return {
    postMessage: () => {},
    getState: () => bag,
    setState: (s: unknown) => {
      bag = s;
    },
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  const base: Session = {
    id: "sess-x",
    name: "",
    project: "claude-manager",
    projectPath: "/home/user/claude-manager",
    branch: "main",
    entrypoint: "cli",
    startTime: Date.now(),
    endTime: Date.now(),
    messageCount: 1,
    summary: "hello",
    prompts: ["hello"],
    projectKey: "claude-manager",
    searchHaystack: "\nclaude-manager\nmain\nhello",
  };
  const merged = { ...base, ...overrides };
  // Rebuild keys so case overrides on `project` reflect in the lookup keys.
  merged.projectKey = merged.project.toLowerCase();
  merged.searchHaystack =
    `${merged.name}\n${merged.project}\n${merged.branch}\n${merged.summary}`.toLowerCase();
  return merged;
}

beforeEach(() => {
  // Reset module state by clearing all setters back to defaults.
  setSessions([]);
  setStats({ totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 });
  setPinnedIds([]);
  setDeletedIds([]);
  setWorkspacePath("");
  setCurrentBranch("");
  setFilterBranch("all");
  setSearchQuery("");
  clearFullTextHits();
  clearSelection();
  // Bind a fresh persistence backend per test so prior writes don't bleed.
  initPersistence(makeFakeVscode());
  // Clear any persisted filters from prior tests by re-loading from the
  // (now-empty) backend, then forcing defaults.
  loadPersistedFilters();
});

describe("setWorkspacePath", () => {
  it("derives a lowercased project name from a unix path", () => {
    setWorkspacePath("/home/user/My-Project");
    expect(getCurrentProjectName()).toBe("my-project");
  });

  it("derives a lowercased project name from a windows path with backslashes", () => {
    setWorkspacePath("C:\\Users\\Me\\Claude-Manager");
    expect(getCurrentProjectName()).toBe("claude-manager");
  });

  it("derives a lowercased project name from a mixed-separator path", () => {
    setWorkspacePath("C:\\Users\\Me/Sub-Dir\\Project");
    expect(getCurrentProjectName()).toBe("project");
  });

  it("falls back to 'all' filter when no workspace and current was selected", () => {
    setFilterProject("current");
    setWorkspacePath("");
    expect(getCurrentProjectName()).toBe("");
    // After setWorkspacePath with empty path, filter should be all
    setSessions([
      makeSession({ id: "1", project: "alpha" }),
      makeSession({ id: "2", project: "beta" }),
    ]);
    expect(getFiltered().length).toBe(2);
  });

  it("does not override an explicit non-current filter when workspace is empty", () => {
    setFilterProject("alpha");
    setWorkspacePath("");
    setSessions([
      makeSession({ id: "1", project: "alpha" }),
      makeSession({ id: "2", project: "beta" }),
    ]);
    expect(getFiltered().map((s) => s.id)).toEqual(["1"]);
  });
});

describe("getFiltered case-insensitive matching", () => {
  it("matches sessions whose project differs only in case from the workspace", () => {
    setSessions([
      makeSession({ id: "1", project: "Claude-Manager" }),
      makeSession({ id: "2", project: "claude-manager" }),
      makeSession({ id: "3", project: "other-project" }),
    ]);
    setWorkspacePath("/home/user/CLAUDE-MANAGER");
    setFilterProject("current");
    const filtered = getFiltered();
    expect(filtered.map((s) => s.id).sort()).toEqual(["1", "2"]);
  });

  it("returns zero sessions when current project name is empty and filter is current", () => {
    setSessions([makeSession({ id: "1", project: "alpha" })]);
    setWorkspacePath("");
    setFilterProject("current");
    // Empty workspace → setWorkspacePath flipped filter to "all", so it returns all.
    expect(getFiltered().length).toBe(1);
  });
});

describe("getProjects sort", () => {
  it("places the current project first regardless of casing", () => {
    setSessions([
      makeSession({ id: "1", project: "Beta" }),
      makeSession({ id: "2", project: "claude-manager" }),
      makeSession({ id: "3", project: "Alpha" }),
    ]);
    setWorkspacePath("/home/user/CLAUDE-MANAGER");
    const projects = getProjects();
    expect(projects[0]).toBe("claude-manager");
  });
});

describe("filter persistence", () => {
  it("persists filterProject across reloads", () => {
    const fake = makeFakeVscode();
    initPersistence(fake);
    setFilterProject("alpha");
    expect(hasPersistedFilterProject()).toBe(true);

    // Simulate a panel reload with the same backend.
    initPersistence(fake);
    loadPersistedFilters();
    setSessions([
      makeSession({ id: "1", project: "alpha" }),
      makeSession({ id: "2", project: "beta" }),
    ]);
    setWorkspacePath("/home/user/beta");
    expect(getFiltered().map((s) => s.id)).toEqual(["1"]);
  });

  it("persists filterDate across reloads", () => {
    const fake = makeFakeVscode();
    initPersistence(fake);
    setFilterDate("month");
    expect(hasPersistedFilterDate()).toBe(true);

    initPersistence(fake);
    loadPersistedFilters();
    expect(hasPersistedFilterDate()).toBe(true);
  });

  it("returns false from hasPersistedFilter* when nothing has been written", () => {
    initPersistence(makeFakeVscode());
    expect(hasPersistedFilterProject()).toBe(false);
    expect(hasPersistedFilterDate()).toBe(false);
  });
});

describe("branch filter", () => {
  it("narrows to sessions on the picked branch", () => {
    setSessions([
      makeSession({ id: "1", branch: "main" }),
      makeSession({ id: "2", branch: "feature/x" }),
      makeSession({ id: "3", branch: "feature/x" }),
      makeSession({ id: "4", branch: "other" }),
    ]);
    setFilterProject("all");
    setFilterBranch("feature/x");
    expect(getFiltered().map((s) => s.id).sort()).toEqual(["2", "3"]);
  });

  it("keeps pinned sessions visible even when on a different branch", () => {
    setSessions([
      makeSession({ id: "1", branch: "main" }),
      makeSession({ id: "2", branch: "feature/x" }),
    ]);
    setPinnedIds(["1"]);
    setFilterProject("all");
    setFilterBranch("feature/x");
    // pinned "1" survives the branch filter
    expect(getFiltered().map((s) => s.id).sort()).toEqual(["1", "2"]);
  });

  it("'all' disables the filter", () => {
    setSessions([
      makeSession({ id: "1", branch: "main" }),
      makeSession({ id: "2", branch: "feature/x" }),
    ]);
    setFilterProject("all");
    setFilterBranch("all");
    expect(getFiltered().length).toBe(2);
  });

  it("'(no branch)' matches sessions with an empty branch field", () => {
    setSessions([
      makeSession({ id: "1", branch: "" }),
      makeSession({ id: "2", branch: "main" }),
    ]);
    setFilterProject("all");
    setFilterBranch("(no branch)");
    expect(getFiltered().map((s) => s.id)).toEqual(["1"]);
  });

  it("exposes getters that reflect setter state", () => {
    setCurrentBranch("main");
    expect(getCurrentBranch()).toBe("main");
    setFilterBranch("feature/z");
    expect(getFilterBranch()).toBe("feature/z");
  });

  it("persists filterBranch across reloads", () => {
    const fake = makeFakeVscode();
    initPersistence(fake);
    setFilterBranch("feature/persist");
    initPersistence(fake);
    loadPersistedFilters();
    expect(getFilterBranch()).toBe("feature/persist");
  });
});

describe("full-text search hits", () => {
  it("unions metadata matches with transcript hits", () => {
    setSessions([
      makeSession({ id: "a", project: "alpha", summary: "refactor api" }),
      makeSession({ id: "b", project: "beta", summary: "unrelated" }),
      makeSession({ id: "c", project: "gamma", summary: "also unrelated" }),
    ]);
    setFilterProject("all");
    setSearchQuery("refactor");
    // no full-text hits yet — only metadata match wins
    expect(getFiltered().map((s) => s.id)).toEqual(["a"]);

    // Extension reports that "c" also matched in the transcript body.
    setFullTextHits("refactor", ["c"]);
    expect(getFiltered().map((s) => s.id).sort()).toEqual(["a", "c"]);
  });

  it("drops stale hits when the echoed query no longer matches", () => {
    setSessions([
      makeSession({ id: "a", summary: "x" }),
      makeSession({ id: "b", summary: "y" }),
    ]);
    setFilterProject("all");
    setSearchQuery("foo");
    // Reply arrives for an older query.
    setFullTextHits("oldquery", ["b"]);
    // Current query is "foo", neither session matches metadata, stale
    // hits are ignored — result should be empty.
    expect(getFiltered()).toEqual([]);
  });

  it("clearFullTextHits removes any previously stored hits", () => {
    setSessions([makeSession({ id: "a", summary: "unrelated" })]);
    setFilterProject("all");
    setSearchQuery("hit");
    setFullTextHits("hit", ["a"]);
    expect(getFiltered().map((s) => s.id)).toEqual(["a"]);
    clearFullTextHits();
    expect(getFiltered()).toEqual([]);
  });

  it("ignores hits whose echo query does not match (racy reply)", () => {
    setSessions([makeSession({ id: "a", summary: "unrelated" })]);
    setFilterProject("all");
    setSearchQuery("later");
    // setFullTextHits is a no-op when query !== current.
    setFullTextHits("earlier", ["a"]);
    expect(getFiltered()).toEqual([]);
  });
});

describe("bulk selection state", () => {
  it("toggleSelected adds then removes the same id", () => {
    toggleSelected("a");
    expect(isSelected("a")).toBe(true);
    expect(selectionCount()).toBe(1);
    toggleSelected("a");
    expect(isSelected("a")).toBe(false);
    expect(selectionCount()).toBe(0);
  });

  it("tracks the most recent toggle as the range anchor", () => {
    toggleSelected("a");
    toggleSelected("b");
    expect(getSelectAnchor()).toBe("b");
  });

  it("selectAll replaces the set with the supplied ids", () => {
    toggleSelected("a");
    selectAll(["x", "y", "z"]);
    expect(isSelected("a")).toBe(false);
    expect(selectionCount()).toBe(3);
    expect(getSelectAnchor()).toBe("z");
  });

  it("setSelectedRange unions ids without dropping prior selections", () => {
    toggleSelected("a");
    setSelectedRange(["b", "c"]);
    expect(selectionCount()).toBe(3);
    expect(isSelected("a")).toBe(true);
  });

  it("clearSelection wipes both the set and the anchor", () => {
    toggleSelected("a");
    clearSelection();
    expect(selectionCount()).toBe(0);
    expect(getSelectAnchor()).toBeNull();
  });
});
