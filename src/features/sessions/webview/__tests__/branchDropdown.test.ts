// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initPersistence } from "../../../../webview/persistence";
import type { VSCodeAPI } from "../../../../webview/types";
import type { Session } from "../../types";
import {
  renderBranchDropdown,
  bindBranchDropdown,
  updateBranchDropdown,
} from "../components/branchDropdown";
import {
  setSessions,
  setCurrentBranch,
  setFilterBranch,
  getFilterBranch,
  setDeletedIds,
  setFilterProject,
  setWorkspacePath,
} from "../state";

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

function mkSess(
  id: string,
  branch: string,
  endTime = Date.now(),
  project = "p",
): Session {
  return {
    id,
    name: "",
    project,
    projectPath: "/" + project,
    branch,
    entrypoint: "cli",
    startTime: endTime,
    endTime,
    messageCount: 0,
    summary: "",
    prompts: [],
    projectKey: project.toLowerCase(),
    searchHaystack: "",
  };
}

beforeEach(() => {
  document.body.innerHTML = renderBranchDropdown();
  initPersistence(makeFakeVscode());
  setSessions([]);
  setDeletedIds([]);
  setCurrentBranch("");
  setFilterBranch("all");
  setFilterProject("all");
  setWorkspacePath("");
  bindBranchDropdown();
});

describe("branchDropdown", () => {
  it("renders the trigger markup", () => {
    expect(document.getElementById("branchDropdownBtn")).not.toBeNull();
    expect(document.getElementById("branchDropdownLabel")!.textContent).toBe(
      "All Branches",
    );
  });

  it("lists every branch that has sessions with counts", () => {
    setSessions([
      mkSess("a", "main"),
      mkSess("b", "main"),
      mkSess("c", "feature/x"),
    ]);
    updateBranchDropdown(() => {});
    const menu = document.getElementById("branchDropdownMenu")!;
    const items = Array.from(menu.querySelectorAll(".dropdown-item"));
    // "All Branches" + 2 concrete branches
    expect(items.length).toBe(3);
    const labels = items.map((i) => (i.textContent || "").trim());
    expect(labels.some((l) => l.startsWith("All Branches"))).toBe(true);
    expect(labels.some((l) => l.startsWith("main"))).toBe(true);
    expect(labels.some((l) => l.startsWith("feature/x"))).toBe(true);
  });

  it("sorts the current branch first", () => {
    const now = Date.now();
    setSessions([
      mkSess("a", "main", now - 1000),
      mkSess("b", "main", now - 500),
      mkSess("c", "feature/x", now),
      mkSess("d", "other", now - 2000),
    ]);
    setCurrentBranch("other");
    updateBranchDropdown(() => {});
    const items = Array.from(
      document.querySelectorAll("#branchDropdownMenu .dropdown-item"),
    );
    // Skip the first ("All Branches") and read the first concrete row.
    const firstConcrete = (items[1].textContent || "").trim();
    expect(firstConcrete.startsWith("other")).toBe(true);
    expect(firstConcrete).toContain("current");
  });

  it("collapses sessions without a branch into a '(no branch)' bucket", () => {
    setSessions([mkSess("a", ""), mkSess("b", ""), mkSess("c", "main")]);
    updateBranchDropdown(() => {});
    const labels = Array.from(
      document.querySelectorAll("#branchDropdownMenu .dropdown-item"),
    ).map((i) => (i.textContent || "").trim());
    expect(labels.some((l) => l.startsWith("(no branch)"))).toBe(true);
  });

  it("click on a row sets the filter and invokes onUpdate", () => {
    setSessions([mkSess("a", "main"), mkSess("b", "feature/x")]);
    const onUpdate = vi.fn();
    updateBranchDropdown(onUpdate);
    const featureRow = Array.from(
      document.querySelectorAll<HTMLElement>("#branchDropdownMenu .dropdown-item"),
    ).find((el) => el.dataset.value === "feature/x")!;
    featureRow.click();
    expect(getFilterBranch()).toBe("feature/x");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("excludes deleted sessions from the branch list and counts", () => {
    setSessions([
      mkSess("a", "main"),
      mkSess("b", "main"),
      mkSess("c", "old"),
    ]);
    setDeletedIds(["c"]);
    updateBranchDropdown(() => {});
    const labels = Array.from(
      document.querySelectorAll("#branchDropdownMenu .dropdown-item"),
    ).map((i) => (i.textContent || "").trim());
    expect(labels.some((l) => l.startsWith("old"))).toBe(false);
  });

  it("trigger label reflects the active selection", () => {
    setSessions([mkSess("a", "main"), mkSess("b", "feature/x")]);
    setFilterBranch("feature/x");
    updateBranchDropdown(() => {});
    expect(document.getElementById("branchDropdownLabel")!.textContent).toBe(
      "feature/x (1)",
    );
  });

  it("escapes HTML in branch names", () => {
    setSessions([mkSess("a", "feat/<img src=x>")]);
    updateBranchDropdown(() => {});
    const menu = document.getElementById("branchDropdownMenu")!;
    expect(menu.querySelector("img")).toBeNull();
    expect(menu.textContent).toContain("<img");
  });

  it("scopes branches to the current project when filterProject is 'current'", () => {
    setSessions([
      mkSess("a", "main", Date.now(), "claude-manager"),
      mkSess("b", "feature/x", Date.now(), "claude-manager"),
      mkSess("c", "hotfix", Date.now(), "other-repo"),
      mkSess("d", "hotfix", Date.now(), "other-repo"),
    ]);
    setWorkspacePath("/home/me/claude-manager");
    setFilterProject("current");
    updateBranchDropdown(() => {});
    const labels = Array.from(
      document.querySelectorAll("#branchDropdownMenu .dropdown-item"),
    ).map((i) => (i.textContent || "").trim());
    expect(labels.some((l) => l.startsWith("hotfix"))).toBe(false);
    expect(labels.some((l) => l.startsWith("main"))).toBe(true);
    expect(labels.some((l) => l.startsWith("feature/x"))).toBe(true);
  });

  it("scopes branches to a named project filter", () => {
    setSessions([
      mkSess("a", "main", Date.now(), "alpha"),
      mkSess("b", "feature/x", Date.now(), "alpha"),
      mkSess("c", "beta-only", Date.now(), "beta"),
    ]);
    setFilterProject("alpha");
    updateBranchDropdown(() => {});
    const labels = Array.from(
      document.querySelectorAll("#branchDropdownMenu .dropdown-item"),
    ).map((i) => (i.textContent || "").trim());
    expect(labels.some((l) => l.startsWith("beta-only"))).toBe(false);
    expect(labels.some((l) => l.startsWith("main"))).toBe(true);
  });

  it("All Branches count reflects the project-scoped total, not the global", () => {
    setSessions([
      mkSess("a", "main", Date.now(), "alpha"),
      mkSess("b", "main", Date.now(), "alpha"),
      mkSess("c", "main", Date.now(), "beta"),
      mkSess("d", "main", Date.now(), "beta"),
      mkSess("e", "main", Date.now(), "beta"),
    ]);
    setFilterProject("alpha");
    updateBranchDropdown(() => {});
    expect(document.getElementById("branchDropdownLabel")!.textContent).toBe(
      "All Branches (2)",
    );
  });
});
