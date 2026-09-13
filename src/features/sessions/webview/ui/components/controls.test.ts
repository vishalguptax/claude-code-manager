// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import type { Session } from "../../../types";
import { ActionsBar } from "./ActionsBar";
import { Filters } from "./Filters";
import { ListHeader } from "./ListHeader";
import {
  bulkModeSignal,
  currentBranchSignal,
  filterBranchSignal,
  filterDateSignal,
  filterProjectSignal,
  filterWorktreeSignal,
  pinnedSignal,
  selectAll,
  selectionSignal,
  sessionsSignal,
  setBulkMode,
  _resetSessionsSignals,
} from "../../model";

const post = vi.fn();
vi.mock("../../../../../webview/shared/hooks", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../webview/shared/hooks")>()),
  useApi: () => ({ post: (m: unknown) => post(m) }),
  setVscodeApi: () => {},
}));

function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    name: "",
    project: "proj",
    projectPath: "/p",
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: 0,
    messageCount: 0,
    summary: "",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
    ...over,
  };
}

beforeEach(() => {
  _resetSessionsSignals();
  post.mockClear();
});

/**
 * Open the filter panel. The pickers are progressive now: search is always
 * there, the four pickers sit behind the toolbar toggle, and anything actually
 * narrowing the list shows as a chip. Tests that assert on a picker have to
 * open the panel first, the same way a user does.
 */
function openFilters(container: ParentNode): void {
  fireEvent.click(
    container.querySelector('[aria-label="Filter sessions"]') as HTMLButtonElement,
  );
}

describe("Filters", () => {
  it("keeps the pickers out of the way until asked for", () => {
    const { container } = render(h(Filters, {}));
    expect(container.querySelector(".filter-panel")).toBeNull();
    expect(container.querySelector(".vsc-search")).toBeTruthy();
    openFilters(container);
    expect(container.querySelector(".filter-panel")).toBeTruthy();
  });

  it("renders the date range as a Segmented control with the active one selected", () => {
    filterDateSignal.value = "week";
    const { container } = render(h(Filters, {}));
    openFilters(container);
    // "Week" now appears twice — once as the active-filter chip, once as the
    // segment — so scope the query to the control under test.
    const seg = [...container.querySelectorAll(".vsc-segmented-seg")].find(
      (b) => b.textContent?.trim() === "Week",
    ) as HTMLButtonElement;
    expect(seg.getAttribute("aria-checked")).toBe("true");
    expect(seg.classList.contains("active")).toBe(true);
  });

  it("changes the date filter on segment click", () => {
    const { container } = render(h(Filters, {}));
    openFilters(container);
    fireEvent.click(
      [...container.querySelectorAll(".vsc-segmented-seg")].find(
        (b) => b.textContent?.trim() === "Month",
      ) as HTMLButtonElement,
    );
    expect(filterDateSignal.value).toBe("month");
  });

  it("renders the project dropdown trigger and lists one option per project when open", () => {
    sessionsSignal.value = [
      session("a", { project: "proj", projectKey: "proj", endTime: 1000 }),
      session("b", { project: "proj", projectKey: "proj", endTime: 2000 }),
    ];
    const { container } = render(h(Filters, {}));
    openFilters(container);
    const trigger = container.querySelector(
      '.vsc-dropdown-trigger[aria-label="Filter by project"]',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger);
    const values = Array.from(container.querySelectorAll(".vsc-menu-label")).map((o) =>
      o.textContent?.trim(),
    );
    // Leads with the two synthetic scopes, then the concrete project.
    expect(values).toContain("This Project");
    expect(values).toContain("All Projects");
    expect(values).toContain("proj");
  });

  it("branch dropdown shows the leading git icon and the current-branch marker", () => {
    sessionsSignal.value = [
      session("a", { branch: "main" }),
      session("b", { branch: "dev" }),
    ];
    currentBranchSignal.value = "main";
    filterProjectSignal.value = "all";
    const { container } = render(h(Filters, {}));
    openFilters(container);
    // Leading git-branch icon is rendered on the closed trigger.
    expect(container.querySelector('.vsc-dropdown-leading [data-icon="git-branch"]')).toBeTruthy();
    const trigger = container.querySelector(
      '.vsc-dropdown-trigger[aria-label="Filter by branch"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    const labels = Array.from(container.querySelectorAll(".vsc-menu-label")).map((o) =>
      o.textContent?.trim(),
    );
    // The current branch's option label is annotated with "(current)".
    expect(labels.some((l) => l === "main (current)")).toBe(true);
  });

  it("hides the branch dropdown when there is only one branch", () => {
    sessionsSignal.value = [session("a", { branch: "main" })];
    const { container } = render(h(Filters, {}));
    openFilters(container);
    expect(
      container.querySelector('.vsc-dropdown-trigger[aria-label="Filter by branch"]'),
    ).toBeNull();
  });

  it("shows the branch dropdown when multiple branches exist", () => {
    sessionsSignal.value = [session("a", { branch: "main" }), session("b", { branch: "dev" })];
    const { container } = render(h(Filters, {}));
    openFilters(container);
    expect(
      container.querySelector('.vsc-dropdown-trigger[aria-label="Filter by branch"]'),
    ).toBeTruthy();
  });
});

/**
 * The chips are the reason the pickers can hide: with four controls sitting at
 * their defaults, "why am I not seeing that session?" used to mean reading all
 * four. A chip appears for anything narrowing the list, and its × widens it.
 */
describe("Filters — active chips", () => {
  it("shows nothing when nothing is narrowing the list", () => {
    filterDateSignal.value = "all";
    filterProjectSignal.value = "all";
    const { container } = render(h(Filters, {}));
    expect(container.querySelector(".filter-chips")).toBeNull();
  });

  it("shows a chip for the date range and clears it back to All", () => {
    filterProjectSignal.value = "all";
    filterDateSignal.value = "week";
    const { container } = render(h(Filters, {}));
    expect(container.querySelector(".filter-chip-label")?.textContent).toBe("Week");
    fireEvent.click(container.querySelector(".filter-chip-clear") as HTMLButtonElement);
    expect(filterDateSignal.value).toBe("all");
  });

  // Showing only the current project IS a filter — it hides sessions — so it
  // reads as a chip like any other rather than as an invisible default.
  it("treats the current-project scope as a filter", () => {
    filterDateSignal.value = "all";
    filterProjectSignal.value = "current";
    const { container } = render(h(Filters, {}));
    const labels = Array.from(container.querySelectorAll(".filter-chip-label")).map(
      (n) => n.textContent,
    );
    expect(labels).toContain("This Project");
    fireEvent.click(container.querySelector(".filter-chip-clear") as HTMLButtonElement);
    expect(filterProjectSignal.value).toBe("all");
  });

  it("offers Clear all only once there are more than two chips", () => {
    filterDateSignal.value = "week";
    filterProjectSignal.value = "current";
    const two = render(h(Filters, {}));
    expect(two.container.querySelector(".filter-chip-clear-all")).toBeNull();
    two.unmount();

    filterBranchSignal.value = "dev";
    filterWorktreeSignal.value = "claude";
    const { container } = render(h(Filters, {}));
    expect(container.querySelectorAll(".filter-chip").length).toBe(4);
    fireEvent.click(container.querySelector(".filter-chip-clear-all") as HTMLButtonElement);
    expect(filterDateSignal.value).toBe("all");
    expect(filterProjectSignal.value).toBe("all");
    expect(filterBranchSignal.value).toBe("all");
    expect(filterWorktreeSignal.value).toBe("all");
  });

  it("names the filter in the clear button's accessible label", () => {
    filterDateSignal.value = "week";
    filterProjectSignal.value = "all";
    const { container } = render(h(Filters, {}));
    expect(container.querySelector(".filter-chip-clear")?.getAttribute("aria-label")).toBe(
      "Clear filter: Date range",
    );
  });
});

describe("ListHeader", () => {
  it("shows the count and Select toggle at rest", () => {
    const { getByText } = render(h(ListHeader, { totalCount: 5 }));
    expect(getByText("5 sessions")).toBeTruthy();
    expect(getByText("Select")).toBeTruthy();
  });

  it("enters bulk mode when Select is clicked", () => {
    const { getByText } = render(h(ListHeader, { totalCount: 5 }));
    fireEvent.click(getByText("Select"));
    expect(bulkModeSignal.value).toBe(true);
  });

  it("shows selection count and actions in bulk mode", () => {
    setBulkMode(true);
    selectAll(["a", "b"]);
    const { getByText } = render(h(ListHeader, { totalCount: 5 }));
    expect(getByText("2 selected")).toBeTruthy();
    expect(getByText("Delete")).toBeTruthy();
  });

  it("posts a bulk delete for the selection", () => {
    setBulkMode(true);
    selectAll(["a", "b"]);
    const { getByText } = render(h(ListHeader, { totalCount: 5 }));
    fireEvent.click(getByText("Delete"));
    expect(post).toHaveBeenCalledWith({ type: "bulkDeleteSessions", ids: ["a", "b"] });
  });

  it("offers Unpin when every selected session is already pinned", () => {
    setBulkMode(true);
    selectAll(["a"]);
    pinnedSignal.value = new Set(["a"]);
    const { getByText } = render(h(ListHeader, { totalCount: 5 }));
    expect(getByText("Unpin")).toBeTruthy();
  });

  it("cancel clears the selection and leaves bulk mode", () => {
    setBulkMode(true);
    selectAll(["a"]);
    const { getByText } = render(h(ListHeader, { totalCount: 5 }));
    fireEvent.click(getByText("Cancel"));
    expect(bulkModeSignal.value).toBe(false);
    expect(selectionSignal.value.size).toBe(0);
  });
});

/**
 * One primary action plus a split menu, where there used to be six equal
 * buttons wrapping to three rows at 280px. The menu items still have to reach
 * the same host messages, so every one of the old assertions survives — it
 * just opens the menu first.
 */
function openMore(container: ParentNode): void {
  fireEvent.click(
    container.querySelector('[aria-label="More session actions"]') as HTMLButtonElement,
  );
}

describe("ActionsBar", () => {
  it("leads with one primary action and two icon affordances", () => {
    const { container, getByText } = render(h(ActionsBar, {}));
    expect(getByText("New session")).toBeTruthy();
    // Everything else in the row is an icon: no second labelled button
    // competing with the primary.
    const labelled = Array.from(container.querySelectorAll(".actions-bar .btn")).filter(
      (b) => (b.textContent ?? "").trim().length > 0,
    );
    expect(labelled.length).toBe(1);
  });

  it("posts newSession from the primary action", () => {
    const { getByText } = render(h(ActionsBar, {}));
    fireEvent.click(getByText("New session"));
    expect(post).toHaveBeenCalledWith({ type: "newSession" });
  });

  it("posts continueLastSession from the inline affordance", () => {
    const { container } = render(h(ActionsBar, {}));
    fireEvent.click(
      container.querySelector('[aria-label="Continue last session"]') as HTMLButtonElement,
    );
    expect(post).toHaveBeenCalledWith({ type: "continueLastSession" });
  });

  it("posts newTempSession from the menu", () => {
    const { container, getByText } = render(h(ActionsBar, {}));
    openMore(container);
    fireEvent.click(getByText("New temporary session"));
    expect(post).toHaveBeenCalledWith({ type: "newTempSession" });
  });

  it("posts importSession from the menu", () => {
    const { container, getByText } = render(h(ActionsBar, {}));
    openMore(container);
    fireEvent.click(getByText("Import a session…"));
    expect(post).toHaveBeenCalledWith({ type: "importSession" });
  });

  it("posts importMultipleSessions from the menu", () => {
    const { container, getByText } = render(h(ActionsBar, {}));
    openMore(container);
    fireEvent.click(getByText("Import many…"));
    expect(post).toHaveBeenCalledWith({ type: "importMultipleSessions" });
  });

  it("restore resumes the recent session group, oldest first", () => {
    const now = Date.now();
    sessionsSignal.value = [session("x", { endTime: now }), session("y", { endTime: now - 1000 })];
    filterProjectSignal.value = "all";
    const { container, getByText } = render(h(ActionsBar, {}));
    openMore(container);
    fireEvent.click(getByText("Restore recent terminals"));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resumeMultiple", sessionIds: ["y", "x"] }),
    );
  });

  it("restore still posts with an empty group so the host can explain why", () => {
    // A silent no-op reads as a broken button; the host owns the toast.
    sessionsSignal.value = [];
    const { container, getByText } = render(h(ActionsBar, {}));
    openMore(container);
    fireEvent.click(getByText("Restore recent terminals"));
    expect(post).toHaveBeenCalledWith({
      type: "resumeMultiple",
      sessionIds: [],
      projectPaths: [],
    });
  });
});
