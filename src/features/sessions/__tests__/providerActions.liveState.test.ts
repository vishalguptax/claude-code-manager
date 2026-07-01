import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as vscode from "vscode";

/**
 * Focused tests for refreshLiveState's self-heal: when the poll sees a live
 * PID for a session that is not in the cached list (a transcript-create event
 * the FS watcher missed), it must pull that session in from a fresh parse and
 * push it — not silently drop it.
 */
const readLiveSessions = vi.fn();
const applyLiveState = vi.fn();
const parseSessions = vi.fn();

vi.mock("../parser", () => ({
  readLiveSessions: (...a: unknown[]) => readLiveSessions(...a),
  applyLiveState: (...a: unknown[]) => applyLiveState(...a),
  parseSessions: (...a: unknown[]) => parseSessions(...a),
  groupSessions: (list: unknown[]) => list,
  getStats: () => ({ totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 }),
  getUniqueProjects: (list: { project: string }[]) => list.map((s) => s.project),
  getLastParseWarning: () => null,
  getSessionFile: () => null,
  clearMetaCaches: () => {},
  clearOrphanCache: () => {},
  clearPendingCache: () => {},
}));

vi.mock("../state", () => ({ loadState: () => ({ renames: {} }) }));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => undefined }));

import { refreshLiveState } from "../providerActions";

interface Posted {
  type: string;
  data?: unknown;
}

function makeCtx(sessions: Array<{ id: string; project: string; endTime: number }>) {
  const posted: Posted[] = [];
  let timer: NodeJS.Timeout | undefined;
  const ctx = {
    getWebview: () =>
      ({
        postMessage: (m: Posted) => {
          posted.push(m);
          return Promise.resolve(true);
        },
      }) as unknown as vscode.Webview,
    getSessions: () => sessions,
    getLiveStateRefreshTimer: () => timer,
    setLiveStateRefreshTimer: (t: NodeJS.Timeout | undefined) => (timer = t),
    buildSearchIndex: vi.fn(),
  };
  return { ctx, posted, sessions };
}

beforeEach(() => {
  vi.useFakeTimers();
  readLiveSessions.mockReset();
  applyLiveState.mockReset();
  parseSessions.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshLiveState self-heal", () => {
  it("pulls in a live session missing from the cached list and posts it", () => {
    const sessions: Array<{ id: string; project: string; endTime: number }> = [];
    const env = makeCtx(sessions);
    readLiveSessions.mockReturnValue(
      new Map([["new-id", { pid: 1, status: "busy", updatedAt: 9 }]]),
    );
    parseSessions.mockReturnValue([{ id: "new-id", project: "proj", endTime: 5 }]);
    applyLiveState.mockReturnValue(true);

    refreshLiveState(env.ctx as never);
    vi.advanceTimersByTime(200);

    expect(env.sessions.map((s) => s.id)).toContain("new-id");
    expect(env.posted.some((p) => p.type === "sessions")).toBe(true);
    expect(env.posted.some((p) => p.type === "projects")).toBe(true);
    expect(env.ctx.buildSearchIndex).toHaveBeenCalled();
  });

  it("does not reparse when every live session is already cached", () => {
    const sessions = [{ id: "known", project: "p", endTime: 1 }];
    const env = makeCtx(sessions);
    readLiveSessions.mockReturnValue(
      new Map([["known", { pid: 1, status: "idle", updatedAt: 1 }]]),
    );
    applyLiveState.mockReturnValue(false);

    refreshLiveState(env.ctx as never);
    vi.advanceTimersByTime(200);

    expect(parseSessions).not.toHaveBeenCalled();
    expect(env.posted).toEqual([]);
  });

  it("still posts a plain live-state change with no additions", () => {
    const sessions = [{ id: "known", project: "p", endTime: 1 }];
    const env = makeCtx(sessions);
    readLiveSessions.mockReturnValue(
      new Map([["known", { pid: 1, status: "busy", updatedAt: 2 }]]),
    );
    applyLiveState.mockReturnValue(true);

    refreshLiveState(env.ctx as never);
    vi.advanceTimersByTime(200);

    expect(parseSessions).not.toHaveBeenCalled();
    expect(env.posted.filter((p) => p.type === "sessions")).toHaveLength(1);
    expect(env.posted.some((p) => p.type === "projects")).toBe(false);
  });
});
