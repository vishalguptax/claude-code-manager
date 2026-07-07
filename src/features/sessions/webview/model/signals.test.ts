import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../types";
import { initPersistence } from "../../../../webview/persistence";
import type { VSCodeAPI } from "../../../../webview/types";
import {
  applyDefaultFilters,
  applyDelta,
  clearSelection,
  currentBranchSignal,
  currentProjectSignal,
  deletedSignal,
  filterBranchSignal,
  filterDateSignal,
  filterProjectSignal,
  filteredSignal,
  getBranches,
  getBranchOptions,
  getFiltered,
  getLastSessionGroup,
  getProjects,
  getProjectOptions,
  initFilterPersistence,
  loadPersistedFilters,
  pinnedSignal,
  rowsSignal,
  searchQuerySignal,
  selectAll,
  selectionSignal,
  sessionsSignal,
  setBulkMode,
  setFullTextHits,
  setPinned,
  setWorkspacePath,
  stopFilterPersistence,
  toggleSelected,
  _resetSessionsSignals,
} from "./signals";

function session(over: Partial<Session> & { id: string }): Session {
  const base: Session = {
    id: over.id,
    name: "",
    project: "proj",
    projectPath: "/repo/proj",
    branch: "main",
    entrypoint: "cli",
    startTime: 1000,
    endTime: 1000,
    messageCount: 1,
    summary: "summary",
    prompts: ["first prompt"],
    projectKey: "proj",
    searchHaystack: "\nproj\nmain\nsummary",
  };
  return { ...base, ...over };
}

describe("sessions signals", () => {
  beforeEach(() => _resetSessionsSignals());

  describe("getFiltered", () => {
    it("hides deleted sessions", () => {
      sessionsSignal.value = [session({ id: "a" }), session({ id: "b" })];
      deletedSignal.value = new Set(["a"]);
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      const ids = getFiltered().map((s) => s.id);
      expect(ids).toEqual(["b"]);
    });

    it("narrows to current project when known", () => {
      sessionsSignal.value = [
        session({ id: "a", projectKey: "alpha", project: "alpha" }),
        session({ id: "b", projectKey: "beta", project: "beta" }),
      ];
      currentProjectSignal.value = "alpha";
      filterProjectSignal.value = "current";
      filterDateSignal.value = "all";
      expect(getFiltered().map((s) => s.id)).toEqual(["a"]);
    });

    it("shows everything when current project unresolved", () => {
      sessionsSignal.value = [session({ id: "a" }), session({ id: "b" })];
      currentProjectSignal.value = "";
      filterProjectSignal.value = "current";
      filterDateSignal.value = "all";
      expect(getFiltered()).toHaveLength(2);
    });

    it("sorts pinned first then by most recent endTime", () => {
      sessionsSignal.value = [
        session({ id: "old", endTime: 100 }),
        session({ id: "new", endTime: 900 }),
        session({ id: "pinnedOld", endTime: 50 }),
      ];
      pinnedSignal.value = new Set(["pinnedOld"]);
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      expect(getFiltered().map((s) => s.id)).toEqual(["pinnedOld", "new", "old"]);
    });

    it("recent mode caps unpinned at 20 but keeps pinned", () => {
      const many = Array.from({ length: 30 }, (_, i) =>
        session({ id: `s${i}`, endTime: i }),
      );
      sessionsSignal.value = [...many, session({ id: "pin", endTime: -1 })];
      pinnedSignal.value = new Set(["pin"]);
      filterProjectSignal.value = "all";
      filterDateSignal.value = "recent";
      const out = getFiltered();
      expect(out[0]?.id).toBe("pin");
      // 20 unpinned + 1 pinned
      expect(out).toHaveLength(21);
    });

    it("branch filter is literal — a pinned session on another branch is hidden (matches badge)", () => {
      sessionsSignal.value = [
        session({ id: "onX", branch: "x", endTime: 100 }),
        session({ id: "pinnedOnY", branch: "y", endTime: 200 }),
      ];
      pinnedSignal.value = new Set(["pinnedOnY"]);
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      filterBranchSignal.value = "x";
      expect(getFiltered().map((s) => s.id)).toEqual(["onX"]);
    });

    it("filters by branch with the (no branch) sentinel", () => {
      sessionsSignal.value = [
        session({ id: "a", branch: "feature" }),
        session({ id: "b", branch: "" }),
      ];
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      filterBranchSignal.value = "(no branch)";
      expect(getFiltered().map((s) => s.id)).toEqual(["b"]);
    });

    it("matches the search haystack", () => {
      sessionsSignal.value = [
        session({ id: "a", searchHaystack: "refactor parser" }),
        session({ id: "b", searchHaystack: "unrelated" }),
      ];
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      searchQuerySignal.value = "parser";
      expect(getFiltered().map((s) => s.id)).toEqual(["a"]);
    });

    it("unions full-text hits with metadata matches for the live query", () => {
      sessionsSignal.value = [
        session({ id: "meta", searchHaystack: "deploy script" }),
        session({ id: "body", searchHaystack: "nothing here" }),
      ];
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      searchQuerySignal.value = "deploy";
      setFullTextHits("deploy", ["body"]);
      expect(getFiltered().map((s) => s.id).sort()).toEqual(["body", "meta"]);
    });

    it("ignores stale full-text hits for a superseded query", () => {
      sessionsSignal.value = [session({ id: "body", searchHaystack: "x" })];
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      searchQuerySignal.value = "current";
      // Reply for an old query must not leak in.
      setFullTextHits("old", ["body"]);
      expect(getFiltered()).toHaveLength(0);
    });
  });

  describe("filteredSignal / rowsSignal memoization", () => {
    it("reuses the cached filtered list across a non-filter signal change", () => {
      sessionsSignal.value = [session({ id: "a" }), session({ id: "b" })];
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      const first = filteredSignal.value;
      // selection is not read by getFiltered → must NOT recompute (same ref).
      selectionSignal.value = new Set(["a"]);
      expect(filteredSignal.value).toBe(first);
      // A data/filter change DOES recompute (new ref).
      sessionsSignal.value = [session({ id: "a" })];
      expect(filteredSignal.value).not.toBe(first);
    });

    it("rowsSignal is memoized against non-filter changes too", () => {
      sessionsSignal.value = [session({ id: "a", endTime: Date.now() })];
      filterProjectSignal.value = "all";
      filterDateSignal.value = "all";
      const rows1 = rowsSignal.value;
      selectionSignal.value = new Set(["a"]);
      expect(rowsSignal.value).toBe(rows1);
    });
  });

  describe("getProjects / getBranches", () => {
    it("orders projects with current first then by activity", () => {
      sessionsSignal.value = [
        session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 10 }),
        session({ id: "b", project: "beta", projectKey: "beta", endTime: 99 }),
      ];
      currentProjectSignal.value = "alpha";
      expect(getProjects()).toEqual(["alpha", "beta"]);
    });

    it("lists distinct branches with (no branch) last", () => {
      sessionsSignal.value = [
        session({ id: "a", branch: "main" }),
        session({ id: "b", branch: "" }),
        session({ id: "c", branch: "dev" }),
      ];
      expect(getBranches()).toEqual(["dev", "main", "(no branch)"]);
    });
  });

  describe("getLastSessionGroup", () => {
    it("returns sessions within the restore window, oldest first", () => {
      const now = Date.now();
      sessionsSignal.value = [
        session({ id: "recent1", endTime: now }),
        session({ id: "recent2", endTime: now - 5 * 60_000 }),
        session({ id: "stale", endTime: now - 60 * 60_000 }),
      ];
      currentProjectSignal.value = "";
      expect(getLastSessionGroup().map((s) => s.id)).toEqual(["recent2", "recent1"]);
    });

    it("returns empty when there are no candidates", () => {
      sessionsSignal.value = [];
      expect(getLastSessionGroup()).toEqual([]);
    });
  });

  describe("applyDelta", () => {
    const base = [session({ id: "a" }), session({ id: "b" })];

    it("adds new sessions", () => {
      const out = applyDelta(base, { added: [session({ id: "c" })] });
      expect(out.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
    });

    it("replaces updated sessions by id", () => {
      const out = applyDelta(base, { updated: [session({ id: "a", name: "renamed" })] });
      expect(out.find((s) => s.id === "a")?.name).toBe("renamed");
      expect(out).toHaveLength(2);
    });

    it("removes sessions by id", () => {
      const out = applyDelta(base, { removed: ["a"] });
      expect(out.map((s) => s.id)).toEqual(["b"]);
    });

    it("does not mutate the input array", () => {
      const input = [...base];
      applyDelta(input, { added: [session({ id: "z" })], removed: ["a"] });
      expect(input.map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("treats an unknown update as an addition", () => {
      const out = applyDelta(base, { updated: [session({ id: "new" })] });
      expect(out.map((s) => s.id).sort()).toEqual(["a", "b", "new"]);
    });
  });

  describe("selection helpers", () => {
    it("toggles selection membership", () => {
      toggleSelected("x");
      expect(selectionSignal.value.has("x")).toBe(true);
      toggleSelected("x");
      expect(selectionSignal.value.has("x")).toBe(false);
    });

    it("selectAll replaces the selection set", () => {
      selectAll(["a", "b"]);
      expect([...selectionSignal.value].sort()).toEqual(["a", "b"]);
    });

    it("clearSelection empties selection and leaves bulk mode", () => {
      setBulkMode(true);
      selectAll(["a"]);
      clearSelection();
      expect(selectionSignal.value.size).toBe(0);
    });

    it("leaving bulk mode clears the selection", () => {
      setBulkMode(true);
      selectAll(["a"]);
      setBulkMode(false);
      expect(selectionSignal.value.size).toBe(0);
    });
  });

  describe("setWorkspacePath", () => {
    it("derives a lowercased project name from the tail segment", () => {
      setWorkspacePath("C:/Users/me/Projects/MyApp");
      expect(currentProjectSignal.value).toBe("myapp");
    });

    it("leaves the project filter untouched when no workspace (getFiltered shows all)", () => {
      // Regression: flipping "current" -> "all" here was captured by the
      // persistence effect and durably corrupted the user's "This Project"
      // choice on the cold-start race where the workspace reads empty for one
      // tick. The filter must stay "current"; getFiltered handles the empty
      // currentProject by showing everything.
      filterProjectSignal.value = "current";
      setWorkspacePath("");
      expect(filterProjectSignal.value).toBe("current");
      expect(currentProjectSignal.value).toBe("");
    });
  });

  describe("setPinned", () => {
    it("replaces the pinned set", () => {
      setPinned(["a", "b"]);
      expect([...pinnedSignal.value].sort()).toEqual(["a", "b"]);
    });
  });

  describe("getProjectOptions", () => {
    it("leads with the two scopes and tallies per-project counts", () => {
      sessionsSignal.value = [
        session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 100 }),
        session({ id: "b", project: "alpha", projectKey: "alpha", endTime: 200 }),
        session({ id: "c", project: "beta", projectKey: "beta", endTime: 300 }),
      ];
      currentProjectSignal.value = "alpha";
      const opts = getProjectOptions();
      expect(opts[0]).toMatchObject({ value: "current", count: 2 });
      expect(opts[1]).toMatchObject({ value: "all", count: 3 });
      const alpha = opts.find((o) => o.value === "alpha");
      expect(alpha?.count).toBe(2);
    });

    it("excludes deleted sessions from every count", () => {
      sessionsSignal.value = [
        session({ id: "a", project: "alpha", projectKey: "alpha" }),
        session({ id: "b", project: "alpha", projectKey: "alpha" }),
      ];
      deletedSignal.value = new Set(["b"]);
      const all = getProjectOptions().find((o) => o.value === "all");
      expect(all?.count).toBe(1);
    });
  });

  describe("getBranchOptions", () => {
    it("leads with All Branches, scopes counts, and marks the current branch", () => {
      sessionsSignal.value = [
        session({ id: "a", branch: "main", endTime: 100 }),
        session({ id: "b", branch: "main", endTime: 200 }),
        session({ id: "c", branch: "dev", endTime: 300 }),
      ];
      currentBranchSignal.value = "main";
      filterProjectSignal.value = "all";
      const opts = getBranchOptions();
      expect(opts[0]).toMatchObject({ value: "all", count: 3 });
      // current branch sorts ahead of the others and is flagged.
      expect(opts[1]).toMatchObject({ value: "main", count: 2, isCurrent: true });
      expect(opts.find((o) => o.value === "dev")?.isCurrent).toBe(false);
    });

    it("buckets empty branches under (no branch)", () => {
      sessionsSignal.value = [session({ id: "a", branch: "" })];
      filterProjectSignal.value = "all";
      const opts = getBranchOptions();
      expect(opts.some((o) => o.value === "(no branch)")).toBe(true);
    });
  });

  describe("filter persistence", () => {
    function makeApi(): VSCodeAPI {
      let state: Record<string, unknown> = {};
      return {
        postMessage: vi.fn(),
        getState: () => state,
        setState: (s) => {
          state = s as Record<string, unknown>;
        },
      };
    }

    it("round-trips project/date/branch across a simulated reload", () => {
      initPersistence(makeApi());
      initFilterPersistence();
      // User changes filters — the effect writes them through.
      filterProjectSignal.value = "all";
      filterDateSignal.value = "month";
      filterBranchSignal.value = "feature/x";
      stopFilterPersistence();

      // Simulate a reload: signals reset to defaults, then restore.
      _resetSessionsSignals();
      expect(filterProjectSignal.value).toBe("current");
      loadPersistedFilters();
      expect(filterProjectSignal.value).toBe("all");
      expect(filterDateSignal.value).toBe("month");
      expect(filterBranchSignal.value).toBe("feature/x");
    });

    it("loadPersistedFilters leaves defaults intact when nothing was stored", () => {
      initPersistence(makeApi());
      loadPersistedFilters();
      expect(filterProjectSignal.value).toBe("current");
      expect(filterDateSignal.value).toBe("recent");
      expect(filterBranchSignal.value).toBe("all");
    });

    it("the eager first run does not persist defaults, so host defaultFilter/defaultProject still apply", () => {
      // Regression: `effect` runs its body immediately on creation. If that run
      // wrote the default signal values into persisted state, every key would
      // read as "defined" and applyDefaultFilters would skip — silently killing
      // the configured settings for a fresh user.
      initPersistence(makeApi());
      loadPersistedFilters(); // fresh user — nothing stored, signals at defaults
      initFilterPersistence(); // eager run must NOT write
      applyDefaultFilters("month", "all"); // host settings arrive after ready
      stopFilterPersistence();
      expect(filterDateSignal.value).toBe("month");
      expect(filterProjectSignal.value).toBe("all");
    });
  });
});
