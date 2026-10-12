// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../../../../../webview/shared/hooks", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../webview/shared/hooks")>()),
  useApi: () => ({ post }),
  setVscodeApi: () => {},
}));

import { seedExplorer } from "../../__tests__/fixtures";
import {
  clickItem,
  effectiveLocationSignal,
  explorerPreviewOpenSignal,
  explorerViewModeSignal,
  navigate,
  searchQuerySignal,
} from "../../model";
import { ExplorerCommandBar, ExplorerStatusBar, ExplorerTopBar } from "./ExplorerBars";

beforeEach(() => {
  seedExplorer();
  post.mockClear();
});
afterEach(cleanup);

describe("ExplorerTopBar", () => {
  it("at home: no way back or up", () => {
    const { getByLabelText } = render(h(ExplorerTopBar, {}));
    expect((getByLabelText("Back") as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText("Up") as HTMLButtonElement).disabled).toBe(true);
  });

  it("in a folder: Back and Up, and a search scoped by name to where you are", () => {
    navigate({ kind: "folder", name: "Work" });
    navigate({ kind: "pinned" });
    const { getByLabelText } = render(h(ExplorerTopBar, {}));
    expect(getByLabelText("Search sessions").getAttribute("placeholder")).toBe("Search Pinned");
    fireEvent.click(getByLabelText("Back"));
    expect(effectiveLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
    fireEvent.click(getByLabelText("Up"));
    expect(effectiveLocationSignal.value).toEqual({ kind: "home" });
  });

  it("searches through the shared search", async () => {
    vi.useFakeTimers();
    const { getByLabelText } = render(h(ExplorerTopBar, {}));
    fireEvent.input(getByLabelText("Search sessions"), { target: { value: "Token" } });
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(searchQuerySignal.value).toBe("token");
    expect(post).toHaveBeenCalledWith({ type: "searchFullText", query: "token" });
  });
});

describe("ExplorerCommandBar", () => {
  const button = (getByText: (t: string) => HTMLElement, label: string) =>
    getByText(label).closest("button") as HTMLButtonElement;

  it("disables the selection commands until something is selected", () => {
    const { getByText } = render(h(ExplorerCommandBar, {}));
    for (const label of ["Move to…", "Pin", "Archive", "Export", "Rename", "Delete"]) {
      expect(button(getByText, label).disabled).toBe(true);
    }
    expect(button(getByText, "New folder").disabled).toBe(false);
  });

  it("acts on the selection", () => {
    clickItem("session:a", { toggle: false, range: false });
    const { getByText } = render(h(ExplorerCommandBar, {}));
    fireEvent.click(getByText("Move to…"));
    expect(post).toHaveBeenLastCalledWith({ type: "moveToFolder", sessionIds: ["a"] });
    fireEvent.click(getByText("Pin"));
    expect(post).toHaveBeenLastCalledWith({ type: "bulkPinSessions", ids: ["a"], pin: true });
    fireEvent.click(getByText("Archive"));
    expect(post).toHaveBeenLastCalledWith({ type: "archiveSessions", sessionIds: ["a"] });
    fireEvent.click(getByText("Export"));
    expect(post).toHaveBeenLastCalledWith({ type: "bulkExportSessions", ids: ["a"] });
    fireEvent.click(getByText("Rename"));
    expect(post).toHaveBeenLastCalledWith({ type: "renameSession", sessionId: "a" });
    fireEvent.click(getByText("Delete"));
    expect(post).toHaveBeenLastCalledWith({ type: "bulkDeleteSessions", ids: ["a"] });
  });

  it("says Unpin when everything selected is pinned, Restore in the archive", () => {
    navigate({ kind: "folder", name: "Work" });
    clickItem("session:p", { toggle: false, range: false });
    const { getByText, unmount } = render(h(ExplorerCommandBar, {}));
    expect(getByText("Unpin")).toBeTruthy();
    unmount();
    navigate({ kind: "archived" });
    clickItem("session:z", { toggle: false, range: false });
    const archive = render(h(ExplorerCommandBar, {}));
    expect(archive.getByText("Restore")).toBeTruthy();
  });

  it("switches layout and the preview pane", () => {
    const { getByText, getByLabelText } = render(h(ExplorerCommandBar, {}));
    fireEvent.click(getByText("Tiles"));
    expect(explorerViewModeSignal.value).toBe("tiles");
    const preview = getByLabelText("Preview pane");
    expect(preview.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(preview);
    expect(explorerPreviewOpenSignal.value).toBe(false);
  });

  it("creates a folder", () => {
    const { getByText } = render(h(ExplorerCommandBar, {}));
    fireEvent.click(getByText("New folder"));
    expect(post).toHaveBeenLastCalledWith({ type: "createFolder" });
  });
});

describe("ExplorerStatusBar", () => {
  it("counts items and the selection, announcing only the counts", () => {
    const { container, rerender } = render(h(ExplorerStatusBar, {}));
    const counts = () => container.querySelector('[role="status"]')?.textContent;
    expect(counts()).toBe("5 items");
    clickItem("session:a", { toggle: false, range: false });
    rerender(h(ExplorerStatusBar, {}));
    expect(counts()).toBe("5 items1 selected");
    expect(container.querySelector('[role="status"] .xp-crumbs')).toBeNull();
  });

  it("shows the path: just Sessions at home", () => {
    const { container } = render(h(ExplorerStatusBar, {}));
    expect(container.querySelector(".xp-crumbs")?.textContent).toBe("Sessions");
  });

  it("in a folder, Sessions is a link home", () => {
    navigate({ kind: "folder", name: "Work" });
    const { container, getByText } = render(h(ExplorerStatusBar, {}));
    expect(container.querySelector(".xp-crumbs")?.textContent).toBe("Sessions›Work");
    fireEvent.click(getByText("Sessions"));
    expect(effectiveLocationSignal.value).toEqual({ kind: "home" });
  });
});
