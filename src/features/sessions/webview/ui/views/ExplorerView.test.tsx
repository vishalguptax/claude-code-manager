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
import { explorerPreviewOpenSignal, navigate, searchQuerySignal } from "../../model";
import { ExplorerView } from "./ExplorerView";

beforeEach(() => {
  seedExplorer();
  post.mockClear();
});
afterEach(cleanup);

const option = (c: Element, text: string) =>
  [...c.querySelectorAll('[role="option"]')].find((o) => o.textContent?.includes(text))!;

describe("ExplorerView", () => {
  it("lays out the top bar, commands, navigation, content, preview and status", () => {
    const { container } = render(h(ExplorerView, {}));
    for (const sel of [".xp-top", ".xp-commands", ".xp-nav", ".xp-main", ".xp-preview", ".xp-status"]) {
      expect(container.querySelector(sel)).toBeTruthy();
    }
  });

  it("drops the preview pane when it is switched off", () => {
    explorerPreviewOpenSignal.value = false;
    const { container } = render(h(ExplorerView, {}));
    expect(container.querySelector(".xp.no-preview")).toBeTruthy();
    expect(container.querySelector(".xp-preview")).toBeNull();
  });

  it("opens the item menu on right-click, acting on that item", () => {
    const { container, getByText } = render(h(ExplorerView, {}));
    fireEvent.contextMenu(option(container, "Session a"));
    fireEvent.click(getByText("Rename session"));
    expect(post).toHaveBeenLastCalledWith({ type: "renameSession", sessionId: "a" });
  });

  it("opens the folder menu from the navigation pane", () => {
    const { container, getByText } = render(h(ExplorerView, {}));
    const work = [...container.querySelectorAll(".xp-nav-item")].find((b) => b.textContent?.startsWith("Work"))!;
    fireEvent.contextMenu(work);
    fireEvent.click(getByText("Remove folder"));
    expect(post).toHaveBeenLastCalledWith({ type: "removeFolder", folder: "Work" });
  });

  it("explains an empty folder, and a search with no matches", () => {
    navigate({ kind: "folder", name: "Empty" });
    const empty = render(h(ExplorerView, {}));
    expect(empty.getByText("This folder is empty")).toBeTruthy();
    cleanup();
    navigate({ kind: "home" });
    searchQuerySignal.value = "nothing like this";
    const none = render(h(ExplorerView, {}));
    expect(none.getByText("No matches")).toBeTruthy();
  });

  it("offers New folder on a right-click in an empty location", () => {
    navigate({ kind: "folder", name: "Empty" });
    const { container, getByText } = render(h(ExplorerView, {}));
    fireEvent.contextMenu(container.querySelector(".xp-items-empty")!);
    fireEvent.click(getByText("New folder", { selector: ".ctx-item *, .ctx-item" }));
    expect(post).toHaveBeenLastCalledWith({ type: "createFolder" });
  });
});
