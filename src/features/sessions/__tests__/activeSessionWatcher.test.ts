import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__mocks__/vscode"));

const fsReadMock = vi.fn();
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
      fsReadMock(...args),
  };
});

vi.mock("../../../core/config", () => ({
  SESSION_ACTIVE_FILE: "/fake/active-sessions.json",
}));

const getProcessStartTimesAsync = vi.fn<(pids: number[]) => Promise<Map<number, number>>>();
vi.mock("../procTime", () => ({
  getProcessStartTimesAsync: (pids: number[]) => getProcessStartTimesAsync(pids),
}));

import { readActiveSessions, filterReusedPpids, type ActiveEntry } from "../activeSessionWatcher";

const NOW = 1_000_000_000_000;

beforeEach(() => {
  fsReadMock.mockReset();
  getProcessStartTimesAsync.mockReset();
  getProcessStartTimesAsync.mockResolvedValue(new Map());
});

describe("readActiveSessions", () => {
  it("returns [] when the file is missing", () => {
    fsReadMock.mockImplementation(() => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });
    expect(readActiveSessions(NOW)).toEqual([]);
  });

  it("returns [] on parse failure", () => {
    fsReadMock.mockReturnValue("not json");
    expect(readActiveSessions(NOW)).toEqual([]);
  });

  it("returns [] when the payload isn't an array", () => {
    fsReadMock.mockReturnValue(JSON.stringify({ sessionId: "a", ppid: 1, ts: NOW }));
    expect(readActiveSessions(NOW)).toEqual([]);
  });

  it("drops entries older than 1h", () => {
    const old = NOW - 2 * 60 * 60 * 1000;
    fsReadMock.mockReturnValue(
      JSON.stringify([{ sessionId: "stale", ppid: process.pid, ts: old }]),
    );
    expect(readActiveSessions(NOW)).toEqual([]);
  });

  it("drops entries whose ppid is no longer alive", () => {
    fsReadMock.mockReturnValue(
      JSON.stringify([{ sessionId: "dead", ppid: 999_999_999, ts: NOW }]),
    );
    expect(readActiveSessions(NOW)).toEqual([]);
  });

  it("keeps entries with live ppid + recent ts", () => {
    fsReadMock.mockReturnValue(
      JSON.stringify([
        {
          sessionId: "fresh",
          ppid: process.pid,
          ts: NOW,
          cwd: "/work",
          transcriptPath: "/t.jsonl",
        },
      ]),
    );
    const out = readActiveSessions(NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sessionId: "fresh",
      ppid: process.pid,
      cwd: "/work",
      transcriptPath: "/t.jsonl",
    });
  });

  it("skips malformed entries inside an otherwise-valid array", () => {
    fsReadMock.mockReturnValue(
      JSON.stringify([
        null,
        "string",
        { ppid: process.pid, ts: NOW },
        { sessionId: "ok", ppid: process.pid, ts: NOW },
      ]),
    );
    const out = readActiveSessions(NOW);
    expect(out.map((e) => e.sessionId)).toEqual(["ok"]);
  });
});

describe("filterReusedPpids", () => {
  const mk = (sessionId: string, ppid: number, ts: number): ActiveEntry => ({
    sessionId,
    ppid,
    ts,
    cwd: "",
    transcriptPath: "",
  });

  it("keeps an entry whose ppid started before ts (real host shell)", async () => {
    getProcessStartTimesAsync.mockResolvedValue(new Map([[10, NOW - 5000]]));
    const out = await filterReusedPpids([mk("a", 10, NOW)]);
    expect(out.map((e) => e.sessionId)).toEqual(["a"]);
  });

  it("drops an entry whose ppid started well after ts (reused pid)", async () => {
    getProcessStartTimesAsync.mockResolvedValue(new Map([[10, NOW + 5 * 60 * 1000]]));
    const out = await filterReusedPpids([mk("a", 10, NOW)]);
    expect(out).toEqual([]);
  });

  it("trusts the entry when the ppid start time is unknown", async () => {
    getProcessStartTimesAsync.mockResolvedValue(new Map());
    const out = await filterReusedPpids([mk("a", 10, NOW)]);
    expect(out.map((e) => e.sessionId)).toEqual(["a"]);
  });

  it("tolerates a small clock gap around ts", async () => {
    getProcessStartTimesAsync.mockResolvedValue(new Map([[10, NOW + 1000]]));
    const out = await filterReusedPpids([mk("a", 10, NOW)]);
    expect(out.map((e) => e.sessionId)).toEqual(["a"]);
  });
});
