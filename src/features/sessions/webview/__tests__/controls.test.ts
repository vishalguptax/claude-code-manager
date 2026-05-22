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
vi.mock("../../../../webview/hooks/useApi", () => ({
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

  it("changes project filter and resets the branch filter", () => {
    filterBranchSignal.value = "main";
    const { container } = render(h(Filters, {}));
    const select = container.querySelector('select[aria-label="Filter by project"]') as HTMLSelectElement;
    select.value = "all";
    fireEvent.change(select);
    expect(filterProjectSignal.value).toBe("all");
    expect(filterBranchSignal.value).toBe("all");
  });

  it("hides the branch select when there is only one branch", () => {
    sessionsSignal.value = [session("a", { branch: "main" })];
    const { container } = render(h(Filters, {}));
    expect(container.querySelector('select[aria-label="Filter by branch"]')).toBeNull();
  });

  it("shows the branch select when multiple branches exist", () => {
    sessionsSignal.value = [session("a", { branch: "main" }), session("b", { branch: "dev" })];
    const { container } = render(h(Filters, {}));
    expect(container.querySelector('select[aria-label="Filter by branch"]')).toBeTruthy();
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
