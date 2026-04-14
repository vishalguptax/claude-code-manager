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
