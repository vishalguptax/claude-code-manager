// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import type { Session } from "../../types";
import { ActionsBar } from "../components/ActionsBar";
import { Filters } from "../components/Filters";
import { ListHeader } from "../components/ListHeader";
import {
  bulkModeSignal,
  currentBranchSignal,
  filterBranchSignal,
  filterDateSignal,
  filterProjectSignal,
  pinnedSignal,
  selectAll,
  selectionSignal,
  sessionsSignal,
  setBulkMode,
  _resetSessionsSignals,
} from "../signals";

const post = vi.fn();
vi.mock("../../../../webview/shared/hooks", async (importActual) => ({
  ...(await importActual<typeof import("../../../../webview/shared/hooks")>()),
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

describe("Filters", () => {
  it("renders the date chips with the active one selected", () => {
    filterDateSignal.value = "week";
    const { getByText } = render(h(Filters, {}));
    const chip = getByText("Week") as HTMLButtonElement;
    expect(chip.getAttribute("aria-selected")).toBe("true");
  });

  it("changes the date filter on chip click", () => {
    const { getByText } = render(h(Filters, {}));
    fireEvent.click(getByText("Month"));
    expect(filterDateSignal.value).toBe("month");
  });

  it("renders the project dropdown with one option per project", () => {
    sessionsSignal.value = [
      session("a", { project: "proj", projectKey: "proj", endTime: 1000 }),
      session("b", { project: "proj", projectKey: "proj", endTime: 2000 }),
    ];
    const { container } = render(h(Filters, {}));
    const select = container.querySelector(
      'vscode-single-select[aria-label="Filter by project"]',
    ) as HTMLElement;
    expect(select).toBeTruthy();
    const values = Array.from(select.querySelectorAll("vscode-option")).map((o) =>
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
    // Leading git-branch icon is rendered beside the control.
    expect(container.querySelector('.vsc-dropdown-leading [data-icon="git-branch"]')).toBeTruthy();
    const labels = Array.from(
      container.querySelectorAll(
        'vscode-single-select[aria-label="Filter by branch"] vscode-option',
      ),
    ).map((o) => o.textContent?.trim());
    // The current branch's option label is annotated with "(current)".
    expect(labels.some((l) => l === "main (current)")).toBe(true);
  });

  it("hides the branch dropdown when there is only one branch", () => {
    sessionsSignal.value = [session("a", { branch: "main" })];
    const { container } = render(h(Filters, {}));
    expect(
      container.querySelector('vscode-single-select[aria-label="Filter by branch"]'),
    ).toBeNull();
  });

  it("shows the branch dropdown when multiple branches exist", () => {
    sessionsSignal.value = [session("a", { branch: "main" }), session("b", { branch: "dev" })];
    const { container } = render(h(Filters, {}));
    expect(
      container.querySelector('vscode-single-select[aria-label="Filter by branch"]'),
    ).toBeTruthy();
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

describe("ActionsBar", () => {
  it("posts newSession on New", () => {
    const { getByText } = render(h(ActionsBar, {}));
    fireEvent.click(getByText("New"));
    expect(post).toHaveBeenCalledWith({ type: "newSession" });
  });

  it("posts newTempSession on Temp", () => {
    const { getByText } = render(h(ActionsBar, {}));
    fireEvent.click(getByText("Temp"));
    expect(post).toHaveBeenCalledWith({ type: "newTempSession" });
  });

  it("posts continueLastSession on Continue", () => {
    const { getByText } = render(h(ActionsBar, {}));
    fireEvent.click(getByText("Continue"));
    expect(post).toHaveBeenCalledWith({ type: "continueLastSession" });
  });

  it("posts importSession on Import", () => {
    const { getByText } = render(h(ActionsBar, {}));
    fireEvent.click(getByText("Import"));
    expect(post).toHaveBeenCalledWith({ type: "importSession" });
  });

  it("restore workspace resumes the last session group", () => {
    const now = Date.now();
    sessionsSignal.value = [session("x", { endTime: now }), session("y", { endTime: now - 1000 })];
    filterProjectSignal.value = "all";
    const { getByText } = render(h(ActionsBar, {}));
    fireEvent.click(getByText("Restore Workspace"));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resumeMultiple" }),
    );
  });
});
