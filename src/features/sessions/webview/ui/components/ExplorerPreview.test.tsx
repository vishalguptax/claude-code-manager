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
import { clickItem, effectiveLocationSignal, selectedIdSignal } from "../../model";
import { ExplorerPreview } from "./ExplorerPreview";

beforeEach(() => {
  seedExplorer();
  post.mockClear();
});
afterEach(cleanup);

describe("ExplorerPreview", () => {
  it("invites a selection when nothing is focused", () => {
    const { getByText } = render(h(ExplorerPreview, {}));
    expect(getByText("Nothing selected")).toBeTruthy();
  });

  it("loads the focused session's detail once", () => {
    clickItem("session:a", { toggle: false, range: false });
    const { container, rerender } = render(h(ExplorerPreview, {}));
    expect(selectedIdSignal.value).toBe("a");
    expect(post).toHaveBeenCalledWith({ type: "getSessionDetail", sessionId: "a", mode: "last", query: "" });
    expect(container.querySelector("#detailView")).toBeTruthy();
    post.mockClear();
    rerender(h(ExplorerPreview, {}));
    expect(post).not.toHaveBeenCalled();
  });

  it("summarises a folder and opens it", () => {
    clickItem("folder:Work", { toggle: false, range: false });
    const { getByText } = render(h(ExplorerPreview, {}));
    expect(getByText("Work")).toBeTruthy();
    expect(getByText(/^2 sessions · last active/)).toBeTruthy();
    fireEvent.click(getByText("Open"));
    expect(effectiveLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
  });

  it("explains an empty folder", () => {
    clickItem("folder:Empty", { toggle: false, range: false });
    const { getByText } = render(h(ExplorerPreview, {}));
    expect(getByText(/^Empty\. Drag sessions here/)).toBeTruthy();
  });

  it("counts a multi-selection instead of previewing one item", () => {
    clickItem("session:a", { toggle: false, range: false });
    clickItem("session:b", { toggle: true, range: false });
    post.mockClear();
    const { getByText } = render(h(ExplorerPreview, {}));
    expect(getByText("2 items selected")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });
});
