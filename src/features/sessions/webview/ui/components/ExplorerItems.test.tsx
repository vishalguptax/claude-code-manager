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
import {
  effectiveLocationSignal,
  explorerFocusSignal,
  explorerSelectionSignal,
  explorerSortSignal,
  explorerViewModeSignal,
  navigate,
  searchQuerySignal,
} from "../../model";
import { SESSION_IDS_MIME } from "./explorerDnd";
import { ExplorerItems, tileColumns } from "./ExplorerItems";

const options = (c: Element) => [...c.querySelectorAll('[role="option"]')];
const option = (c: Element, text: string) => {
  const el = options(c).find((o) => o.textContent?.includes(text));
  if (!el) throw new Error(`no option: ${text}`);
  return el;
};
const selected = () => [...explorerSelectionSignal.value].sort();

beforeEach(() => {
  seedExplorer();
  post.mockClear();
});
afterEach(cleanup);

describe("ExplorerItems — details", () => {
  it("lists folders first (in the active sort — newest first), then sessions, as one listbox", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    expect(container.querySelector('[role="listbox"][aria-multiselectable="true"]')).toBeTruthy();
    expect(options(container).map((o) => o.querySelector(".xp-name")?.textContent)).toEqual([
      "Work",
      "Empty",
      "Session a",
      "Session b",
      "Session c",
    ]);
  });

  it("shows sizes: a folder's session count, a session's messages", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    expect(option(container, "Work").querySelector(".xp-cell-num")?.textContent).toBe("2 sessions");
    expect(option(container, "Session a").querySelector(".xp-cell-num")?.textContent).toBe("3 msgs");
  });

  it("selects with click, toggles with Cmd/Ctrl, ranges with Shift", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    fireEvent.click(option(container, "Session a"));
    fireEvent.click(option(container, "Session c"), { metaKey: true });
    expect(selected()).toEqual(["session:a", "session:c"]);
    fireEvent.click(option(container, "Session c"), { ctrlKey: true });
    expect(selected()).toEqual(["session:a"]);
    // A plain click sets the anchor; Shift selects from it to the target.
    fireEvent.click(option(container, "Session a"));
    fireEvent.click(option(container, "Session c"), { shiftKey: true });
    expect(selected()).toEqual(["session:a", "session:b", "session:c"]);
    expect(option(container, "Session b").getAttribute("aria-selected")).toBe("true");
  });

  it("clears the selection on a click in empty space, not on an item", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    fireEvent.click(option(container, "Session a"));
    fireEvent.click(container.querySelector('[role="listbox"]')!);
    expect(selected()).toEqual([]);
  });

  it("points the listbox at the focused item", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    fireEvent.click(option(container, "Session b"));
    const active = container.querySelector('[role="listbox"]')!.getAttribute("aria-activedescendant");
    expect(container.querySelector(`#${active}`)?.textContent).toContain("Session b");
  });

  it("opens on double-click: into a folder, or a session in its own tab", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    fireEvent.dblClick(option(container, "Session a"));
    expect(post).toHaveBeenLastCalledWith({ type: "openSessionPanel", sessionId: "a" });
    fireEvent.dblClick(option(container, "Work"));
    expect(effectiveLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
  });

  it("drives the keyboard map from the listbox", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    fireEvent.keyDown(container.querySelector('[role="listbox"]')!, { key: "ArrowDown" });
    expect(explorerFocusSignal.value).toBe("folder:Work");
  });

  it("reports right-clicks on an item (selecting it) and on empty space", () => {
    const onMenu = vi.fn();
    const { container } = render(h(ExplorerItems, { onMenu }));
    fireEvent.contextMenu(option(container, "Session b"), { clientX: 1, clientY: 2 });
    expect(onMenu.mock.calls[0][0]).toMatchObject({ x: 1, y: 2, item: { key: "session:b" } });
    expect(selected()).toEqual(["session:b"]);
    fireEvent.contextMenu(container.querySelector('[role="listbox"]')!);
    expect(onMenu.mock.calls[1][0]).toMatchObject({ item: null });
  });

  it("drags sessions out and takes them in on folders", () => {
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    const out = drag(option(container, "Session a"), "dragstart");
    expect(JSON.parse(out.data[SESSION_IDS_MIME])).toEqual(["a"]);
    expect(option(container, "Session a").getAttribute("draggable")).toBe("true");
    expect(option(container, "Work").getAttribute("draggable")).not.toBe("true");
    drag(option(container, "Empty"), "drop", { [SESSION_IDS_MIME]: '["b"]' });
    expect(post).toHaveBeenLastCalledWith({ type: "fileSessions", sessionIds: ["b"], folder: "Empty" });
    expect(drag(option(container, "Session c"), "dragover", { [SESSION_IDS_MIME]: '["b"]' }).accepted).toBe(
      false,
    );
  });

  it("sorts from the column headers, flipping on a second click", () => {
    const { getByLabelText } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    fireEvent.click(getByLabelText("Sort by Name"));
    expect(explorerSortSignal.value).toEqual({ key: "name", dir: "asc" });
    fireEvent.click(getByLabelText("Sort by Name"));
    expect(explorerSortSignal.value).toEqual({ key: "name", dir: "desc" });
    fireEvent.click(getByLabelText("Sort by Size"));
    expect(explorerSortSignal.value).toEqual({ key: "messages", dir: "desc" });
  });

  it("adds a Folder column where the list spans folders", () => {
    const home = render(h(ExplorerItems, { onMenu: vi.fn() }));
    expect(home.container.querySelector(".xp-head.has-folder-col")).toBeNull();
    cleanup();
    navigate({ kind: "all" });
    const all = render(h(ExplorerItems, { onMenu: vi.fn() }));
    expect(option(all.container, "Session w").textContent).toContain("Work");
    cleanup();
    navigate({ kind: "home" });
    searchQuerySignal.value = "session";
    const search = render(h(ExplorerItems, { onMenu: vi.fn() }));
    expect(search.container.querySelector(".xp-head.has-folder-col")).toBeTruthy();
  });
});

describe("ExplorerItems — tiles", () => {
  it("renders the same items as tiles, still one listbox", () => {
    explorerViewModeSignal.value = "tiles";
    const { container } = render(h(ExplorerItems, { onMenu: vi.fn() }));
    expect(container.querySelectorAll(".xp-tile")).toHaveLength(5);
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();
    fireEvent.click(option(container, "Session a"));
    expect(selected()).toEqual(["session:a"]);
  });

  it("fits as many tiles across as the pane allows", () => {
    expect(tileColumns(0)).toBe(1);
    expect(tileColumns(240)).toBe(1);
    expect(tileColumns(476)).toBe(2);
    expect(tileColumns(1000)).toBe(4);
  });
});
