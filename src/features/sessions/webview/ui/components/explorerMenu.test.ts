// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../../../../../webview/shared/hooks", () => ({
  useApi: () => ({ post }),
  setVscodeApi: () => {},
}));

import { makeSession, seedExplorer } from "../../__tests__/fixtures";
import type { ExplorerItem } from "../../lib";
import { effectiveLocationSignal, explorerSelectionSignal } from "../../model";
import { type ExplorerMenuContext, buildExplorerMenu } from "./explorerMenu";

function ctx(over: Partial<ExplorerMenuContext> = {}): ExplorerMenuContext {
  return {
    selectedCount: 1,
    selectedSessionIds: ["a"],
    pinned: new Set(),
    archived: new Set(),
    temp: new Set(),
    inArchive: false,
    viewMode: "details",
    setViewMode: vi.fn(),
    ...over,
  };
}

const folder: ExplorerItem = { kind: "folder", key: "folder:Work", name: "Work", count: 2, modified: 1 };
const sessionItem: ExplorerItem = {
  kind: "session",
  key: "session:a",
  session: makeSession("a"),
  folder: undefined,
};
const labels = (items: { label: string }[]) => items.map((i) => i.label);

beforeEach(() => {
  seedExplorer();
  post.mockClear();
});

describe("buildExplorerMenu", () => {
  it("offers New folder, Select all and the layouts on empty space", () => {
    const setViewMode = vi.fn();
    const items = buildExplorerMenu(null, ctx({ viewMode: "tiles", setViewMode }));
    expect(labels(items)).toEqual(["New folder", "Select all", "Details layout", "Tiles layout"]);
    expect(items.find((i) => i.label === "Tiles layout")?.icon).toBe("check");
    items.find((i) => i.label === "Details layout")?.onSelect();
    expect(setViewMode).toHaveBeenCalledWith("details");
    items[0].onSelect();
    expect(post).toHaveBeenLastCalledWith({ type: "createFolder" });
  });

  it("offers Open, Rename and Remove for a folder", () => {
    const items = buildExplorerMenu(folder, ctx());
    expect(labels(items)).toEqual(["Open", "Rename folder", "Remove folder"]);
    items[0].onSelect();
    expect(effectiveLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
    items[1].onSelect();
    expect(post).toHaveBeenLastCalledWith({ type: "renameFolder", folder: "Work" });
  });

  it("gives one session its own menu", () => {
    const items = buildExplorerMenu(sessionItem, ctx());
    expect(labels(items)).toContain("Open in editor");
    expect(labels(items)).toContain("Move to folder…");
  });

  it("gives a multi-selection the bulk commands, acting on all of it", () => {
    explorerSelectionSignal.value = new Set(["session:a", "session:b"]);
    const items = buildExplorerMenu(
      sessionItem,
      ctx({ selectedCount: 2, selectedSessionIds: ["a", "b"], pinned: new Set(["a", "b"]) }),
    );
    expect(labels(items)).toEqual(["Move to folder…", "Unpin", "Archive", "Export…", "Delete 2 items"]);
    items[0].onSelect();
    expect(post).toHaveBeenLastCalledWith({ type: "moveToFolder", sessionIds: ["a", "b"] });
    expect(items.at(-1)?.danger).toBe(true);
  });

  it("offers Restore in the archive, and only Delete when no session is selected", () => {
    const restore = buildExplorerMenu(sessionItem, ctx({ selectedCount: 2, inArchive: true }));
    expect(labels(restore)).toContain("Restore from archive");
    const foldersOnly = buildExplorerMenu(folder, ctx({ selectedCount: 2, selectedSessionIds: [] }));
    expect(labels(foldersOnly)).toEqual(["Delete 2 items"]);
  });
});
