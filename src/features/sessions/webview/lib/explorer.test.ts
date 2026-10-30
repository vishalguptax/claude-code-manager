import { describe, expect, it } from "vitest";
import type { Session } from "../../types";
import {
  type ExplorerInput,
  type ExplorerItem,
  HOME,
  buildItems,
  chunk,
  locationCounts,
  locationKey,
  locationLabel,
  rangeKeys,
  sameLocation,
  sessionKey,
  sessionTitle,
} from "./explorer";

function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    name: `Session ${id}`,
    project: "proj",
    projectPath: "/p",
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: 0,
    messageCount: 1,
    summary: "",
    prompts: [`prompt ${id}`],
    projectKey: "proj",
    searchHaystack: `session ${id}`,
    ...over,
  };
}

function input(over: Partial<ExplorerInput> = {}): ExplorerInput {
  return {
    sessions: [],
    folderNames: [],
    folders: new Map(),
    pinned: new Set(),
    archived: new Set(),
    inProject: () => true,
    query: "",
    hits: null,
    ...over,
  };
}

const NEWEST = { key: "modified", dir: "desc" } as const;
const keys = (items: ExplorerItem[]): string[] => items.map((i) => i.key);

describe("buildItems — locations", () => {
  const sessions = [
    session("a", { endTime: 30 }),
    session("b", { endTime: 20 }),
    session("c", { endTime: 10 }),
    session("arch", { endTime: 40 }),
  ];
  const base = input({
    sessions,
    folderNames: ["Work", "Empty"],
    folders: new Map([
      ["b", "Work"],
      ["arch", "Work"],
    ]),
    pinned: new Set(["c"]),
    archived: new Set(["arch"]),
  });

  it("home lists every folder, empty ones included, then the unfiled sessions", () => {
    expect(keys(buildItems(base, HOME, NEWEST))).toEqual([
      "folder:Work",
      "folder:Empty",
      "session:a",
      "session:c",
    ]);
  });

  it("counts a folder's live sessions and its latest activity, leaving archived ones out", () => {
    const work = buildItems(base, HOME, NEWEST).find((i) => i.key === "folder:Work");
    expect(work).toMatchObject({ kind: "folder", count: 1, modified: 20 });
    const empty = buildItems(base, HOME, NEWEST).find((i) => i.key === "folder:Empty");
    expect(empty).toMatchObject({ count: 0, modified: 0 });
  });

  it("a folder holds its own sessions, without the archived ones", () => {
    expect(keys(buildItems(base, { kind: "folder", name: "Work" }, NEWEST))).toEqual(["session:b"]);
  });

  it("All spans folders; Pinned and Archived hold what they say", () => {
    expect(keys(buildItems(base, { kind: "all" }, NEWEST))).toEqual([
      "session:a",
      "session:b",
      "session:c",
    ]);
    expect(keys(buildItems(base, { kind: "pinned" }, NEWEST))).toEqual(["session:c"]);
    expect(keys(buildItems(base, { kind: "archived" }, NEWEST))).toEqual(["session:arch"]);
  });

  it("tags each session with its folder", () => {
    const b = buildItems(base, { kind: "all" }, NEWEST).find((i) => i.key === "session:b");
    expect(b).toMatchObject({ kind: "session", folder: "Work" });
  });

  it("applies the project filter", () => {
    const filtered = input({ ...base, inProject: (s) => s.id !== "c" });
    expect(keys(buildItems(filtered, { kind: "all" }, NEWEST))).toEqual(["session:a", "session:b"]);
  });
});

describe("buildItems — search", () => {
  const base = input({
    sessions: [
      session("a", { searchHaystack: "fix token refresh", endTime: 3 }),
      session("b", { searchHaystack: "billing ledger", endTime: 2 }),
      session("c", { searchHaystack: "docs", endTime: 1 }),
    ],
    folderNames: ["Tokens", "Other"],
    folders: new Map([["a", "Tokens"]]),
  });

  it("from home searches every folder too, and matches folder names", () => {
    const items = buildItems({ ...base, query: "token" }, HOME, NEWEST);
    expect(keys(items)).toEqual(["folder:Tokens", "session:a"]);
  });

  it("inside a folder narrows only that folder", () => {
    expect(buildItems({ ...base, query: "ledger" }, { kind: "folder", name: "Tokens" }, NEWEST)).toEqual(
      [],
    );
  });

  it("adds the host's transcript hits for the live query", () => {
    const items = buildItems({ ...base, query: "kubernetes", hits: new Set(["c"]) }, HOME, NEWEST);
    expect(keys(items)).toEqual(["session:c"]);
  });

  it("keeps folder counts to the project filter, not the search", () => {
    const items = buildItems({ ...base, query: "token" }, HOME, NEWEST);
    expect(items[0]).toMatchObject({ kind: "folder", count: 1 });
  });
});

describe("buildItems — sorting", () => {
  const base = input({
    sessions: [
      session("a", { name: "beta", project: "z", endTime: 1, messageCount: 9 }),
      session("b", { name: "Alpha", project: "y", endTime: 3, messageCount: 2 }),
      session("c", { name: "gamma", project: "x", endTime: 2, messageCount: 5 }),
    ],
    folderNames: ["zeta", "Aardvark"],
  });
  const order = (key: "name" | "project" | "modified" | "messages", dir: "asc" | "desc") =>
    keys(buildItems(base, HOME, { key, dir }));

  it("keeps folders ahead of sessions whatever the sort", () => {
    for (const k of ["name", "project", "modified", "messages"] as const) {
      expect(order(k, "desc").slice(0, 2).every((key) => key.startsWith("folder:"))).toBe(true);
    }
  });

  it("sorts by name without regard to case, both ways", () => {
    expect(order("name", "asc")).toEqual([
      "folder:Aardvark",
      "folder:zeta",
      "session:b",
      "session:a",
      "session:c",
    ]);
    expect(order("name", "desc").slice(2)).toEqual(["session:c", "session:a", "session:b"]);
  });

  it("sorts by modified, messages and project", () => {
    expect(order("modified", "desc").slice(2)).toEqual(["session:b", "session:c", "session:a"]);
    expect(order("messages", "desc").slice(2)).toEqual(["session:a", "session:c", "session:b"]);
    expect(order("project", "asc").slice(2)).toEqual(["session:c", "session:b", "session:a"]);
  });
});

describe("locationCounts", () => {
  it("counts each location, archived sessions only under Archived, ignoring the search", () => {
    const counts = locationCounts(
      input({
        sessions: [session("a"), session("b"), session("c"), session("d")],
        folders: new Map([
          ["a", "Work"],
          ["d", "Work"],
        ]),
        pinned: new Set(["a"]),
        archived: new Set(["d"]),
        query: "nothing matches this",
      }),
    );
    expect(Object.fromEntries(counts)).toEqual({
      all: 3,
      pinned: 1,
      home: 2,
      "folder:Work": 1,
      archived: 1,
    });
  });
});

describe("location helpers", () => {
  it("keys, labels and compares locations", () => {
    expect(locationKey(HOME)).toBe("home");
    expect(locationKey({ kind: "folder", name: "home" })).toBe("folder:home");
    expect(locationLabel(HOME)).toBe("Sessions");
    expect(locationLabel({ kind: "folder", name: "Work" })).toBe("Work");
    expect(sameLocation({ kind: "folder", name: "a" }, { kind: "folder", name: "a" })).toBe(true);
    expect(sameLocation({ kind: "folder", name: "a" }, { kind: "folder", name: "b" })).toBe(false);
    expect(sameLocation(HOME, { kind: "all" })).toBe(false);
  });

  it("titles a session by name, then its opening prompt", () => {
    expect(sessionTitle(session("a"))).toBe("Session a");
    expect(sessionTitle(session("a", { name: "" }))).toBe("prompt a");
    expect(sessionTitle(session("a", { name: "", prompts: [] }))).toBe("Untitled session");
    expect(sessionKey("a")).toBe("session:a");
  });
});

describe("rangeKeys", () => {
  const all = ["a", "b", "c", "d"];

  it("covers anchor to target in either direction", () => {
    expect(rangeKeys(all, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeKeys(all, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("is just the target without a usable anchor, and empty for an unknown target", () => {
    expect(rangeKeys(all, null, "c")).toEqual(["c"]);
    expect(rangeKeys(all, "gone", "c")).toEqual(["c"]);
    expect(rangeKeys(all, "a", "zz")).toEqual([]);
  });
});

describe("chunk", () => {
  it("splits into rows, the last one short", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("treats a size below one as one", () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });
});
