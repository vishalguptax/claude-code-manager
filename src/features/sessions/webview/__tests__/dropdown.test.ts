// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initPersistence } from "../../../../webview/persistence";
import type { VSCodeAPI } from "../../../../webview/types";
import type { Session } from "../../types";
import {
  renderDropdown,
  bindDropdown,
  updateDropdown,
} from "../components/dropdown";
import {
  setSessions,
  setStats,
  setDeletedIds,
  setWorkspacePath,
  setFilterProject,
  setFilterBranch,
  getFilterBranch,
  getFilterProject,
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

function mkSess(id: string, project: string, branch = "main"): Session {
  const now = Date.now();
  return {
    id,
    name: "",
    project,
    projectPath: "/" + project,
    branch,
    entrypoint: "cli",
    startTime: now,
    endTime: now,
    messageCount: 0,
    summary: "",
    prompts: [],
    projectKey: project.toLowerCase(),
    searchHaystack: "",
  };
}

beforeEach(() => {
  document.body.innerHTML = `<div class="filter-row">${renderDropdown()}</div>`;
  initPersistence(makeFakeVscode());
  setSessions([]);
  setStats({ totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 });
  setDeletedIds([]);
  setWorkspacePath("");
  setFilterProject("all");
  setFilterBranch("all");
  bindDropdown();
});

describe("project dropdown", () => {
  it("resets filterBranch to 'all' when a different project is picked", () => {
    setSessions([
      mkSess("a", "alpha", "feature/old"),
      mkSess("b", "beta", "main"),
    ]);
    setStats({ totalSessions: 2, totalProjects: 2, thisWeek: 2, totalMessages: 0 });
    setFilterBranch("feature/old");
    expect(getFilterBranch()).toBe("feature/old");

    const onUpdate = vi.fn();
    updateDropdown(onUpdate);

    const betaRow = Array.from(
      document.querySelectorAll<HTMLElement>("#dropdownMenu .dropdown-item"),
    ).find((el) => el.dataset.value === "beta")!;
    betaRow.click();

    expect(getFilterProject()).toBe("beta");
    // Branch filter should snap back to the default so the user sees
    // beta's sessions rather than being left on a dead "feature/old"
    // filter that no longer matches anything.
    expect(getFilterBranch()).toBe("all");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("also resets filterBranch when user picks 'all' or 'current'", () => {
    setSessions([mkSess("a", "alpha")]);
    setStats({ totalSessions: 1, totalProjects: 1, thisWeek: 1, totalMessages: 0 });
    setFilterBranch("feature/x");
    updateDropdown(() => {});
    const allRow = document.querySelector<HTMLElement>(
      "#dropdownMenu .dropdown-item[data-value='all']",
    )!;
    allRow.click();
    expect(getFilterBranch()).toBe("all");
  });
});
