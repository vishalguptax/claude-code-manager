import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../types";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../../../../webview/shared/hooks", () => ({
  useApi: () => ({ post }),
  setVscodeApi: () => {},
}));

import { normPath } from "../../../../core/utils";
import { initPersistence } from "../../../../webview/persistence";
import {
  _resetExplorer,
  canDropOn,
  clearExplorerSelection,
  clickItem,
  contextSelect,
  deleteSelection,
  dragSessionIds,
  dropOnLocation,
  effectiveLocationSignal,
  explorerFocusSignal,
  explorerHistorySignal,
  explorerItemsSignal,
  explorerLocationSignal,
  explorerPreviewOpenSignal,
  explorerProjectOptionsSignal,
  explorerProjectSignal,
  explorerSelectionSignal,
  explorerSortSignal,
  explorerViewModeSignal,
  focusedItemSignal,
  goBack,
  goUp,
  handleExplorerKey,
  initExplorerPersistence,
  moveFocus,
  navigate,
  openFocused,
  renameFocused,
  selectAllItems,
  selectedSessionIdsSignal,
  toggleArchiveSelection,
  togglePinSelection,
} from "./explorer";
import {
  _resetSessionsSignals,
  fullTextSignal,
  searchQuerySignal,
  sessionsSignal,
  setArchived,
  setFolderNames,
  setFolders,
  setPinned,
  setWorkspacePath,
} from "./signals";

function session(id: string, endTime: number, over: Partial<Session> = {}): Session {
  const projectPath = over.projectPath ?? "/w/proj";
  return {
    id,
    name: `Session ${id}`,
    project: "proj",
    projectPath,
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime,
    messageCount: 1,
    summary: "",
    prompts: [],
    // Keyed by full path, as the host keys it (see historyParser).
    projectKey: normPath(projectPath),
    searchHaystack: `session ${id}`,
    ...over,
  };
}

const lastPost = (): unknown => post.mock.calls.at(-1)?.[0];
const selected = (): string[] => [...explorerSelectionSignal.value].sort();
const key = (k: string, mods: Partial<KeyboardEvent> = {}, columns = 1): boolean =>
  handleExplorerKey(
    { key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods },
    columns,
  );

beforeEach(() => {
  _resetSessionsSignals();
  _resetExplorer();
  post.mockClear();
  setWorkspacePath("/w/proj");
  // Home, newest first: folder Work, then a, b, c, d.
  sessionsSignal.value = [
    session("d", 1),
    session("c", 2),
    session("b", 3),
    session("a", 4),
    session("w", 5),
    session("other", 6, { project: "other", projectPath: "/w/other" }),
  ];
  setFolderNames(["Work"]);
  setFolders({ w: "Work" });
});

describe("what the explorer shows", () => {
  it("opens on the workspace's project", () => {
    expect(explorerProjectSignal.value).toBe("current");
    expect(explorerItemsSignal.value.map((i) => i.key)).toEqual([
      "folder:Work",
      "session:a",
      "session:b",
      "session:c",
      "session:d",
    ]);
  });

  it("shows every project once the filter is widened", () => {
    explorerProjectSignal.value = "all";
    expect(explorerItemsSignal.value.map((i) => i.key)).toContain("session:other");
  });

  it("offers This Project and All Projects first, with counts", () => {
    const [current, all] = explorerProjectOptionsSignal.value;
    expect(current).toMatchObject({ value: "current", count: 5 });
    expect(all).toMatchObject({ value: "all", count: 6 });
  });

  it("uses the shared search, including the host's transcript hits", () => {
    searchQuerySignal.value = "kubernetes";
    expect(explorerItemsSignal.value).toEqual([]);
    fullTextSignal.value = { query: "kubernetes", ids: new Set(["c"]) };
    expect(explorerItemsSignal.value.map((i) => i.key)).toEqual(["session:c"]);
  });

  it("falls back home when the open folder disappears", () => {
    navigate({ kind: "folder", name: "Work" });
    setFolderNames([]);
    setFolders({});
    expect(effectiveLocationSignal.value).toEqual({ kind: "home" });
  });
});

describe("navigation", () => {
  it("moves, keeps history for Back, and clears the selection and search", () => {
    clickItem("session:a", { toggle: false, range: false });
    searchQuerySignal.value = "work";
    navigate({ kind: "folder", name: "Work" });
    expect(explorerLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
    expect(selected()).toEqual([]);
    expect(searchQuerySignal.value).toBe("");

    navigate({ kind: "pinned" });
    goBack();
    expect(explorerLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
    goBack();
    expect(explorerLocationSignal.value).toEqual({ kind: "home" });
    expect(explorerHistorySignal.value).toEqual([]);
    goBack();
    expect(explorerLocationSignal.value).toEqual({ kind: "home" });
  });

  it("does not record a visit to where it already is", () => {
    navigate({ kind: "home" });
    expect(explorerHistorySignal.value).toEqual([]);
  });

  it("goes up to home from anywhere else", () => {
    navigate({ kind: "archived" });
    goUp();
    expect(explorerLocationSignal.value).toEqual({ kind: "home" });
  });
});

describe("selection", () => {
  it("click selects one, Cmd/Ctrl toggles, Shift selects the range", () => {
    clickItem("session:a", { toggle: false, range: false });
    expect(selected()).toEqual(["session:a"]);
    clickItem("session:c", { toggle: true, range: false });
    expect(selected()).toEqual(["session:a", "session:c"]);
    clickItem("session:c", { toggle: true, range: false });
    expect(selected()).toEqual(["session:a"]);

    clickItem("session:b", { toggle: false, range: false });
    clickItem("session:d", { toggle: false, range: true });
    expect(selected()).toEqual(["session:b", "session:c", "session:d"]);
    expect(explorerFocusSignal.value).toBe("session:d");
  });

  it("a right-click keeps a selection it lands in, and replaces one it misses", () => {
    clickItem("session:a", { toggle: false, range: false });
    clickItem("session:b", { toggle: true, range: false });
    contextSelect("session:a");
    expect(selected()).toEqual(["session:a", "session:b"]);
    contextSelect("session:c");
    expect(selected()).toEqual(["session:c"]);
  });

  it("selects all and clears", () => {
    selectAllItems();
    expect(selected()).toHaveLength(5);
    expect(explorerFocusSignal.value).toBe("folder:Work");
    clearExplorerSelection();
    expect(selected()).toEqual([]);
    expect(focusedItemSignal.value).toBeNull();
  });

  it("only sessions count for the session commands", () => {
    selectAllItems();
    expect(selectedSessionIdsSignal.value).toEqual(["a", "b", "c", "d"]);
  });

  it("moves the focus, selection following, extending with Shift", () => {
    moveFocus(1, false);
    expect(explorerFocusSignal.value).toBe("folder:Work");
    moveFocus(2, false);
    expect(selected()).toEqual(["session:b"]);
    moveFocus(1, true);
    expect(selected()).toEqual(["session:b", "session:c"]);
    moveFocus(99, false);
    expect(explorerFocusSignal.value).toBe("session:d");
  });
});

describe("keyboard", () => {
  it("walks a list with Up / Down, and a grid by whole rows", () => {
    key("ArrowDown");
    key("ArrowDown");
    expect(explorerFocusSignal.value).toBe("session:a");
    expect(key("ArrowRight")).toBe(false);
    key("ArrowDown", {}, 2);
    expect(explorerFocusSignal.value).toBe("session:c");
    key("ArrowLeft", {}, 2);
    expect(explorerFocusSignal.value).toBe("session:b");
  });

  it("Home / End jump to the ends; Shift extends", () => {
    key("End");
    expect(explorerFocusSignal.value).toBe("session:d");
    key("Home", { shiftKey: true });
    expect(selected()).toHaveLength(5);
  });

  it("Enter steps into a folder; Backspace and Alt+Up come back up", () => {
    clickItem("folder:Work", { toggle: false, range: false });
    key("Enter");
    expect(explorerLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
    key("Backspace");
    expect(explorerLocationSignal.value).toEqual({ kind: "home" });
    navigate({ kind: "pinned" });
    key("ArrowUp", { altKey: true });
    expect(explorerLocationSignal.value).toEqual({ kind: "home" });
    navigate({ kind: "pinned" });
    key("ArrowLeft", { altKey: true });
    expect(explorerLocationSignal.value).toEqual({ kind: "home" });
  });

  it("Enter opens a session in its own tab", () => {
    clickItem("session:a", { toggle: false, range: false });
    key("Enter");
    expect(lastPost()).toEqual({ type: "openSessionPanel", sessionId: "a" });
  });

  it("F2 renames, Delete and Cmd+Backspace delete, Cmd+A selects, Escape clears", () => {
    clickItem("folder:Work", { toggle: false, range: false });
    key("F2");
    expect(lastPost()).toEqual({ type: "renameFolder", folder: "Work" });
    clickItem("session:a", { toggle: false, range: false });
    key("F2");
    expect(lastPost()).toEqual({ type: "renameSession", sessionId: "a" });
    key("Delete");
    expect(lastPost()).toEqual({ type: "bulkDeleteSessions", ids: ["a"] });
    post.mockClear();
    key("Backspace", { metaKey: true });
    expect(lastPost()).toEqual({ type: "bulkDeleteSessions", ids: ["a"] });
    key("a", { ctrlKey: true });
    expect(selected()).toHaveLength(5);
    key("Escape");
    expect(selected()).toEqual([]);
  });

  it("leaves other keys alone", () => {
    expect(key("x")).toBe(false);
    expect(key("a")).toBe(false);
  });
});

describe("commands", () => {
  it("removes selected folders outright and sends sessions through the delete confirm", () => {
    selectAllItems();
    deleteSelection();
    const sent = post.mock.calls.map((c) => c[0]);
    expect(sent).toContainEqual({ type: "removeFolder", folder: "Work" });
    expect(sent).toContainEqual({ type: "bulkDeleteSessions", ids: ["a", "b", "c", "d"] });
  });

  it("pins, then unpins once everything selected is pinned", () => {
    clickItem("session:a", { toggle: false, range: false });
    togglePinSelection();
    expect(lastPost()).toEqual({ type: "bulkPinSessions", ids: ["a"], pin: true });
    setPinned(["a"]);
    togglePinSelection();
    expect(lastPost()).toEqual({ type: "bulkPinSessions", ids: ["a"], pin: false });
  });

  it("archives, or restores in the archive", () => {
    clickItem("session:a", { toggle: false, range: false });
    toggleArchiveSelection();
    expect(lastPost()).toEqual({ type: "archiveSessions", sessionIds: ["a"] });
    setArchived(["a"]);
    navigate({ kind: "archived" });
    clickItem("session:a", { toggle: false, range: false });
    toggleArchiveSelection();
    expect(lastPost()).toEqual({ type: "unarchiveSession", sessionId: "a" });
  });

  it("does nothing on an empty selection", () => {
    togglePinSelection();
    toggleArchiveSelection();
    openFocused();
    renameFocused();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("drag and drop", () => {
  it("drags the whole selection from a selected item, else just that item", () => {
    clickItem("session:a", { toggle: false, range: false });
    clickItem("session:b", { toggle: true, range: false });
    expect(dragSessionIds("session:a")).toEqual(["a", "b"]);
    expect(dragSessionIds("session:c")).toEqual(["c"]);
    expect(dragSessionIds("folder:Work")).toEqual([]);
  });

  it("drops file into a folder, unfile at home, pin on Pinned, archive on Archived", () => {
    dropOnLocation({ kind: "folder", name: "Work" }, ["a"]);
    expect(lastPost()).toEqual({ type: "fileSessions", sessionIds: ["a"], folder: "Work" });
    dropOnLocation({ kind: "home" }, ["a"]);
    expect(lastPost()).toEqual({ type: "fileSessions", sessionIds: ["a"], folder: "" });
    dropOnLocation({ kind: "pinned" }, ["a"]);
    expect(lastPost()).toEqual({ type: "bulkPinSessions", ids: ["a"], pin: true });
    dropOnLocation({ kind: "archived" }, ["a"]);
    expect(lastPost()).toEqual({ type: "archiveSessions", sessionIds: ["a"] });
  });

  it("refuses drops on All", () => {
    expect(canDropOn({ kind: "all" })).toBe(false);
    expect(canDropOn({ kind: "home" })).toBe(true);
    post.mockClear();
    dropOnLocation({ kind: "all" }, ["a"]);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("layout preferences", () => {
  it("restores saved choices and saves changes", () => {
    let state: Record<string, unknown> = {
      "explorer.viewMode": "tiles",
      "explorer.previewOpen": false,
      "explorer.sort": { key: "name", dir: "asc" },
    };
    initPersistence({
      postMessage: () => {},
      getState: () => state,
      setState: (s: unknown) => {
        state = s as Record<string, unknown>;
      },
    });
    const stop = initExplorerPersistence();
    expect(explorerViewModeSignal.value).toBe("tiles");
    expect(explorerPreviewOpenSignal.value).toBe(false);
    expect(explorerSortSignal.value).toEqual({ key: "name", dir: "asc" });

    explorerViewModeSignal.value = "details";
    expect(state["explorer.viewMode"]).toBe("details");
    stop();
  });

  it("brings the tab back where it was after VS Code reloads it", () => {
    let state: Record<string, unknown> = {
      "explorer.location": { kind: "folder", name: "Work" },
      "explorer.project": "all",
    };
    initPersistence({
      postMessage: () => {},
      getState: () => state,
      setState: (s: unknown) => {
        state = s as Record<string, unknown>;
      },
    });
    const stop = initExplorerPersistence();
    expect(effectiveLocationSignal.value).toEqual({ kind: "folder", name: "Work" });
    expect(explorerProjectSignal.value).toBe("all");

    navigate({ kind: "pinned" });
    explorerProjectSignal.value = "current";
    expect(state["explorer.location"]).toEqual({ kind: "pinned" });
    expect(state["explorer.project"]).toBe("current");
    stop();
  });

  it("ignores a saved location it cannot read", () => {
    for (const bad of [{ kind: "folder" }, { kind: "trash" }, "home", null]) {
      _resetExplorer();
      initPersistence({
        postMessage: () => {},
        getState: () => ({ "explorer.location": bad }),
        setState: () => {},
      });
      const stop = initExplorerPersistence();
      expect(explorerLocationSignal.value).toEqual({ kind: "home" });
      stop();
    }
  });

  it("ignores saved values it does not recognise", () => {
    initPersistence({
      postMessage: () => {},
      getState: () => ({
        "explorer.viewMode": "gallery",
        "explorer.sort": { key: "bogus", dir: "asc" },
      }),
      setState: () => {},
    });
    const stop = initExplorerPersistence();
    expect(explorerViewModeSignal.value).toBe("details");
    expect(explorerSortSignal.value).toEqual({ key: "modified", dir: "desc" });
    stop();
  });
});
