import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Focused tests for the PID-reuse guard in readSessionsDir/readLiveSessions.
 * `process.pid` is used as the live PID (it is genuinely alive during the
 * test), and the OS start-time lookup is mocked so each case controls whether
 * the recorded `startedAt` matches the "real" process.
 */
const { SESSIONS_DIR } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { SESSIONS_DIR: _path.join(_os.tmpdir(), ".claude-test-livereuse", "sessions") };
});

vi.mock("../../../core/config", () => ({ SESSIONS_DIR }));

const getProcessStartTimes = vi.fn<(pids: number[]) => Map<number, number>>();
vi.mock("../procTime", () => ({
  getProcessStartTimes: (pids: number[]) => getProcessStartTimes(pids),
}));

// getSessionFile is only reached by the awaiting_question refinement, which
// these tests do not exercise; stub it so no real file index is built.
vi.mock("../metaParser", () => ({ getSessionFile: () => null }));

import { readLiveSessions } from "../liveSessions";

function writePid(pid: number, sessionId: string, extra: Record<string, unknown> = {}): void {
  fs.writeFileSync(
    path.join(SESSIONS_DIR, `${pid}.json`),
    JSON.stringify({ pid, sessionId, ...extra }),
  );
}

beforeEach(() => {
  fs.rmSync(path.dirname(SESSIONS_DIR), { recursive: true, force: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  getProcessStartTimes.mockReset();
  getProcessStartTimes.mockReturnValue(new Map());
});

describe("readLiveSessions PID-reuse guard", () => {
  it("keeps a session whose OS start time matches the recorded startedAt", () => {
    writePid(process.pid, "s-live", { startedAt: 1000, status: "busy", updatedAt: 5 });
    getProcessStartTimes.mockReturnValue(new Map([[process.pid, 1000]]));
    expect(readLiveSessions().has("s-live")).toBe(true);
  });

  it("tolerates a small gap between OS start time and startedAt", () => {
    writePid(process.pid, "s-lag", { startedAt: 1000 });
    getProcessStartTimes.mockReturnValue(new Map([[process.pid, 3000]]));
    expect(readLiveSessions().has("s-lag")).toBe(true);
  });

  it("drops a session whose PID was reused (start time mismatch)", () => {
    writePid(process.pid, "s-reused", { startedAt: 1000 });
    getProcessStartTimes.mockReturnValue(new Map([[process.pid, 9_000_000]]));
    expect(readLiveSessions().has("s-reused")).toBe(false);
  });

  it("trusts liveness (and skips the query) when startedAt is absent", () => {
    writePid(process.pid, "s-nostart", { status: "idle" });
    expect(readLiveSessions().has("s-nostart")).toBe(true);
    expect(getProcessStartTimes).not.toHaveBeenCalled();
  });

  it("keeps the session when the OS start time is unavailable", () => {
    writePid(process.pid, "s-unknown", { startedAt: 1000 });
    getProcessStartTimes.mockReturnValue(new Map()); // query returned nothing
    expect(readLiveSessions().has("s-unknown")).toBe(true);
  });
});
