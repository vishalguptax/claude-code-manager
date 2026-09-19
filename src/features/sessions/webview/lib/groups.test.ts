import { describe, expect, it } from "vitest";
import type { Session, SessionGroup } from "../../types";
import { buildRows, flattenGroups, sessionDayLabel } from "./groups";

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

describe("sessionDayLabel", () => {
  // Fixed clock: Wed 2026-09-09 15:00 local. Every expectation below is
  // relative to it, so the ladder is asserted without depending on the day
  // the suite happens to run.
  const NOW = new Date(2026, 8, 9, 15, 0, 0).getTime();
  const daysAgo = (n: number, hour = 12): number =>
    new Date(2026, 8, 9 - n, hour, 0, 0).getTime();

  it("labels today and yesterday", () => {
    expect(sessionDayLabel(daysAgo(0), NOW)).toBe("Today");
    expect(sessionDayLabel(daysAgo(1), NOW)).toBe("Yesterday");
  });

  it("counts calendar days, not elapsed hours", () => {
    // 00:30 today is under an hour old at 15:00 only in elapsed terms; what
    // matters is that it falls on today's date.
    expect(sessionDayLabel(daysAgo(0, 0), NOW)).toBe("Today");
    // 23:30 yesterday is ~15h old — still Yesterday, never Today.
    expect(sessionDayLabel(daysAgo(1, 23), NOW)).toBe("Yesterday");
  });

  it("treats a future timestamp as today rather than an unlabelled bucket", () => {
    // Clock skew between the host writing the transcript and the webview
    // rendering it must not produce a negative-day label.
    expect(sessionDayLabel(NOW + 3600_000, NOW)).toBe("Today");
  });

  it("names each of the remaining days in the last week", () => {
    expect(sessionDayLabel(daysAgo(2), NOW)).toBe("Mon, Sep 7");
    expect(sessionDayLabel(daysAgo(6), NOW)).toBe("Thu, Sep 3");
  });

  it("buckets the next five weeks into ranges aligned to today", () => {
    // Day 7 opens the first week bucket, which spans days 7..13.
    expect(sessionDayLabel(daysAgo(7), NOW)).toBe("Aug 27 – Sep 2");
    expect(sessionDayLabel(daysAgo(13), NOW)).toBe("Aug 27 – Sep 2");
    // Day 14 opens the second.
    expect(sessionDayLabel(daysAgo(14), NOW)).toBe("Aug 20 – Aug 26");
  });

  it("falls back to month and year past the week tier", () => {
    expect(sessionDayLabel(daysAgo(35), NOW)).toBe("August 2026");
    expect(sessionDayLabel(daysAgo(400), NOW)).toBe("August 2025");
  });

  it("produces labels in recency order for a descending timeline", () => {
    // buildRows relies on labels changing monotonically as it walks a
    // newest-first list; a bucket that reappeared later would split a section.
    const seen: string[] = [];
    for (let d = 0; d <= 40; d++) {
      const label = sessionDayLabel(daysAgo(d), NOW);
      if (label !== seen[seen.length - 1]) seen.push(label);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("buildRows", () => {
  const NOW = new Date(2026, 8, 9, 15, 0, 0).getTime();
  const daysAgo = (n: number): number => new Date(2026, 8, 9 - n, 12, 0, 0).getTime();

  function s(id: string, endTime: number): Session {
    return session(id, { endTime });
  }

  const labels = (rows: ReturnType<typeof buildRows>): string[] =>
    rows.filter((r) => r.kind === "header").map((r) => (r as { label: string }).label);
  const ids = (rows: ReturnType<typeof buildRows>): string[] =>
    rows
      .filter((r) => r.kind === "session")
      .map((r) => (r as { session: Session }).session.id);

  it("interleaves a header before each new date group", () => {
    const rows = buildRows([s("a", daysAgo(0)), s("b", daysAgo(40))], new Set(), new Set(), NOW);
    expect(rows[0]).toMatchObject({ kind: "header", label: "Today" });
    expect(rows[1]).toMatchObject({ kind: "session" });
    expect(rows[2]).toMatchObject({ kind: "header" });
  });

  it("puts Today above Pinned so today's work is never buried", () => {
    // The reported bug: a session stops being live, drops out of Active, and
    // lands under the whole pinned stash — off-screen in a narrow sidebar.
    const rows = buildRows(
      [s("todays", daysAgo(0)), s("old-pin", daysAgo(20))],
      new Set(["old-pin"]),
      new Set(),
      NOW,
    );
    expect(labels(rows)).toEqual(["Today", "Pinned"]);
    expect(ids(rows)).toEqual(["todays", "old-pin"]);
  });

  it("keeps a session pinned today in Today, not in Pinned", () => {
    const rows = buildRows([s("a", daysAgo(0))], new Set(["a"]), new Set(), NOW);
    expect(labels(rows)).toEqual(["Today"]);
  });

  it("does not emit a Pinned header when nothing is pinned", () => {
    const rows = buildRows([s("a", daysAgo(0))], new Set(), new Set(), NOW);
    expect(labels(rows)).not.toContain("Pinned");
  });

  it("hoists live sessions under an Active header above everything", () => {
    const live = session("live", { endTime: daysAgo(0), isLive: true });
    const rows = buildRows(
      [live, s("pinned", daysAgo(20)), s("plain", daysAgo(0))],
      new Set(["pinned"]),
      new Set(),
      NOW,
    );
    expect(labels(rows)).toEqual(["Active", "Today", "Pinned"]);
    expect(ids(rows)).toEqual(["live", "plain", "pinned"]);
  });

  it("never shows the same session twice when it is both live and pinned", () => {
    const livePinned = session("dual", { endTime: daysAgo(0), isLive: true });
    const rows = buildRows([livePinned], new Set(["dual"]), new Set(), NOW);
    expect(ids(rows)).toEqual(["dual"]);
    expect(labels(rows)).toEqual(["Active"]);
  });

  it("reports a row count on every header", () => {
    const rows = buildRows(
      [s("a", daysAgo(0)), s("b", daysAgo(0)), s("c", daysAgo(2))],
      new Set(),
      new Set(),
      NOW,
    );
    expect(rows[0]).toMatchObject({ label: "Today", count: 2 });
    expect(rows.find((r) => r.kind === "header" && r.label === "Mon, Sep 7")).toMatchObject({
      count: 1,
    });
  });

  it("splits a week into one section per day", () => {
    const rows = buildRows(
      [
        s("d0", daysAgo(0)),
        s("d1", daysAgo(1)),
        s("d2", daysAgo(2)),
        s("d3", daysAgo(3)),
      ],
      new Set(),
      new Set(),
      NOW,
    );
    expect(labels(rows)).toEqual(["Today", "Yesterday", "Mon, Sep 7", "Sun, Sep 6"]);
  });

  it("groups same-day sessions under one header", () => {
    const rows = buildRows(
      [s("a", new Date(2026, 8, 7, 18).getTime()), s("b", new Date(2026, 8, 7, 9).getTime())],
      new Set(),
      new Set(),
      NOW,
    );
    expect(labels(rows)).toEqual(["Mon, Sep 7"]);
    expect(ids(rows)).toEqual(["a", "b"]);
  });

  it("drops the rows of a collapsed section but keeps its header and count", () => {
    const rows = buildRows(
      [s("p1", daysAgo(20)), s("p2", daysAgo(21)), s("today", daysAgo(0))],
      new Set(["p1", "p2"]),
      new Set(["Pinned"]),
      NOW,
    );
    expect(labels(rows)).toEqual(["Today", "Pinned"]);
    expect(ids(rows)).toEqual(["today"]);
    expect(rows.find((r) => r.kind === "header" && r.label === "Pinned")).toMatchObject({
      count: 2,
      collapsed: true,
    });
  });

  it("collapses a date section independently of the others", () => {
    const rows = buildRows(
      [s("a", daysAgo(0)), s("b", daysAgo(1)), s("c", daysAgo(2))],
      new Set(),
      new Set(["Yesterday"]),
      NOW,
    );
    expect(labels(rows)).toEqual(["Today", "Yesterday", "Mon, Sep 7"]);
    expect(ids(rows)).toEqual(["a", "c"]);
  });

  it("emits no rows for an empty list", () => {
    expect(buildRows([], new Set(), new Set(), NOW)).toEqual([]);
  });
});
