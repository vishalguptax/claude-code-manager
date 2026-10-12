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

import { drag, seedExplorer } from "../../__tests__/fixtures";
import { effectiveLocationSignal } from "../../model";
import { SESSION_IDS_MIME } from "./explorerDnd";
import { ExplorerNav } from "./ExplorerNav";

const ids = (list: string[]) => ({ [SESSION_IDS_MIME]: JSON.stringify(list) });

function row(container: Element, label: string): Element {
  const el = [...container.querySelectorAll(".xp-nav-row")].find(
    (r) => r.querySelector(".xp-nav-label")?.textContent === label,
  );
  if (!el) throw new Error(`no nav row: ${label}`);
  return el;
}

beforeEach(() => {
  seedExplorer();
  post.mockClear();
});
afterEach(cleanup);

describe("ExplorerNav", () => {
  it("shows Sessions with its folders beneath (alphabetical), then the views, with counts", () => {
    const { container } = render(h(ExplorerNav, { onFolderMenu: vi.fn() }));
    const rows = [...container.querySelectorAll(".xp-nav-row")].map((r) => [
      r.querySelector(".xp-nav-label")?.textContent,
      r.querySelector(".xp-nav-count")?.textContent ?? "",
      r.classList.contains("nested"),
    ]);
    expect(rows).toEqual([
      ["Sessions", "3", false],
      ["Empty", "", true],
      ["Work", "2", true],
      ["All sessions", "5", false],
      ["Pinned", "1", false],
      ["Archived", "1", false],
    ]);
  });

  it("marks where the explorer is and navigates on click", () => {
    const { container } = render(h(ExplorerNav, { onFolderMenu: vi.fn() }));
    expect(row(container, "Sessions").classList.contains("active")).toBe(true);
    fireEvent.click(row(container, "Work").querySelector(".xp-nav-item")!);
    expect(effectiveLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
    expect(row(container, "Work").querySelector("[aria-current]")).toBeTruthy();
  });

  it("collapses and expands the folders", () => {
    const { container, getByLabelText } = render(h(ExplorerNav, { onFolderMenu: vi.fn() }));
    fireEvent.click(getByLabelText("Collapse folders"));
    expect(container.querySelectorAll(".xp-nav-row.nested")).toHaveLength(0);
    fireEvent.click(getByLabelText("Expand folders"));
    expect(container.querySelectorAll(".xp-nav-row.nested")).toHaveLength(2);
  });

  it("files, unfiles, pins and archives by drop — and All takes no drops", () => {
    const { container } = render(h(ExplorerNav, { onFolderMenu: vi.fn() }));
    drag(row(container, "Empty"), "drop", ids(["a"]));
    expect(post).toHaveBeenLastCalledWith({ type: "fileSessions", sessionIds: ["a"], folder: "Empty" });
    drag(row(container, "Sessions"), "drop", ids(["w"]));
    expect(post).toHaveBeenLastCalledWith({ type: "fileSessions", sessionIds: ["w"], folder: "" });
    drag(row(container, "Pinned"), "drop", ids(["a"]));
    expect(post).toHaveBeenLastCalledWith({ type: "bulkPinSessions", ids: ["a"], pin: true });
    drag(row(container, "Archived"), "drop", ids(["a"]));
    expect(post).toHaveBeenLastCalledWith({ type: "archiveSessions", sessionIds: ["a"] });
    expect(drag(row(container, "All sessions"), "dragover", ids(["a"])).accepted).toBe(false);
  });

  it("highlights a target while a drag is over it", () => {
    const { container } = render(h(ExplorerNav, { onFolderMenu: vi.fn() }));
    drag(row(container, "Work"), "dragover", ids(["a"]));
    expect(row(container, "Work").classList.contains("is-drop")).toBe(true);
  });

  it("asks for a folder's menu on right-click, and only for folders", () => {
    const onFolderMenu = vi.fn();
    const { container } = render(h(ExplorerNav, { onFolderMenu }));
    fireEvent.contextMenu(row(container, "Work").querySelector(".xp-nav-item")!, {
      clientX: 4,
      clientY: 8,
    });
    expect(onFolderMenu).toHaveBeenCalledWith("Work", 4, 8);
    fireEvent.contextMenu(row(container, "Pinned").querySelector(".xp-nav-item")!);
    expect(onFolderMenu).toHaveBeenCalledTimes(1);
  });
});
