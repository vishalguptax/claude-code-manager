import { describe, expect, it } from "vitest";
import type { Session, SessionGroup } from "../../types";
import { buildRows, flattenGroups } from "./groups";

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
    messageCount: 1,
    summary: "s",
    prompts: [`prompt ${id}`],
    projectKey: "proj",
    searchHaystack: `prompt ${id}`,
    ...over,
  };
}

describe("flattenGroups", () => {
  it("concatenates grouped sessions in display order", () => {
    const groups: SessionGroup[] = [
      { label: "Today", sessions: [session("a"), session("b")] },
      { label: "Yesterday", sessions: [session("c")] },
    ];
    expect(flattenGroups(groups).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for no groups", () => {
    expect(flattenGroups([])).toEqual([]);
  });
});

describe("buildRows", () => {
  function s(id: string, endTime: number): Session {
    return session(id, { endTime });
  }

  it("interleaves a header before each new date group", () => {
    const now = Date.now();
    const rows = buildRows([s("a", now), s("b", now - 40 * 86400000)], new Set());
    expect(rows[0]).toMatchObject({ kind: "header", label: "Today" });
    expect(rows[1]).toMatchObject({ kind: "session" });
    expect(rows[2]).toMatchObject({ kind: "header" });
  });

  it("puts pinned sessions under a Pinned header first", () => {
    const now = Date.now();
    const rows = buildRows([s("a", now), s("b", now)], new Set(["b"]));
    expect(rows[0]).toMatchObject({ kind: "header", label: "Pinned" });
    expect(rows[1]).toMatchObject({ kind: "session" });
  });

  it("does not emit a Pinned header when nothing is pinned", () => {
    const now = Date.now();
    const rows = buildRows([s("a", now)], new Set());
    expect(rows.some((r) => r.kind === "header" && r.label === "Pinned")).toBe(false);
  });

  it("hoists live sessions under an Active header above Pinned and date groups", () => {
    const now = Date.now();
    const live = session("live", { endTime: now, isLive: true });
    const pinnedSession = s("pinned", now);
    const plain = s("plain", now);
    const rows = buildRows([live, pinnedSession, plain], new Set(["pinned"]));
    expect(rows[0]).toMatchObject({ kind: "header", label: "Active" });
    expect(rows[1]).toMatchObject({ kind: "session", session: { id: "live" } });
    const pinnedIdx = rows.findIndex((r) => r.kind === "header" && r.label === "Pinned");
    expect(pinnedIdx).toBeGreaterThan(1);
  });

  it("never shows the same session twice when it is both live and pinned", () => {
    const now = Date.now();
    const livePinned = session("dual", { endTime: now, isLive: true });
    const rows = buildRows([livePinned], new Set(["dual"]));
    const ids = rows.filter((r) => r.kind === "session").map((r) => (r as { session: Session }).session.id);
    expect(ids).toEqual(["dual"]);
    expect(rows.some((r) => r.kind === "header" && r.label === "Pinned")).toBe(false);
    expect(rows[0]).toMatchObject({ kind: "header", label: "Active" });
  });
});
