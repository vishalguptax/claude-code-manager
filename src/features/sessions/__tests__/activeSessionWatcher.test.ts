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

import { readActiveSessions } from "../activeSessionWatcher";

const NOW = 1_000_000_000_000;

beforeEach(() => {
  fsReadMock.mockReset();
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
