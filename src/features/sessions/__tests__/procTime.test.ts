import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const stat = vi.fn();
const execFile = vi.fn();

vi.mock("fs", () => ({ promises: { stat: (...a: unknown[]) => stat(...a) } }));
vi.mock("child_process", () => ({ execFile: (...a: unknown[]) => execFile(...a) }));

import {
  getProcessStartTimes,
  getProcessStartTimesAsync,
  _clearProcStartCache,
} from "../procTime";

const ORIG_PLATFORM = process.platform;

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: p, configurable: true });
}

/** Wire the execFile mock to resolve with the given stdout (callback style). */
function mockExec(stdout: string): void {
  execFile.mockImplementation((_cmd, _args, _opts, cb: (e: unknown, r: unknown) => void) => {
    cb(null, { stdout });
  });
}

beforeEach(() => {
  _clearProcStartCache();
  stat.mockReset();
  execFile.mockReset();
});

afterEach(() => {
  setPlatform(ORIG_PLATFORM);
  vi.useRealTimers();
});

describe("getProcessStartTimesAsync", () => {
  it("linux: reads /proc/<pid> mtime as the start time", async () => {
    setPlatform("linux");
    stat.mockResolvedValue({ mtimeMs: 111 });
    const m = await getProcessStartTimesAsync([42]);
    expect(m.get(42)).toBe(111);
    expect(stat).toHaveBeenCalledWith("/proc/42");
  });

  it("darwin: parses `ps` lstart output into UTC ms", async () => {
    setPlatform("darwin");
    mockExec("  123 Wed Jul  1 11:39:30 2026\n");
    const m = await getProcessStartTimesAsync([123]);
    expect(m.get(123)).toBe(Date.parse("Wed Jul  1 11:39:30 2026"));
  });

  it("win32: parses `pid unixms` powershell output", async () => {
    setPlatform("win32");
    mockExec("123 1782886110955\r\n456 1782886182158\r\n");
    const m = await getProcessStartTimesAsync([123, 456]);
    expect(m.get(123)).toBe(1782886110955);
    expect(m.get(456)).toBe(1782886182158);
  });

  it("returns an empty map on unsupported platforms", async () => {
    setPlatform("aix" as NodeJS.Platform);
    expect((await getProcessStartTimesAsync([1])).size).toBe(0);
  });

  it("omits a PID whose query fails, and does not throw", async () => {
    setPlatform("linux");
    stat.mockRejectedValue(new Error("no such process"));
    expect((await getProcessStartTimesAsync([9])).has(9)).toBe(false);
  });

  it("caches a failed lookup so it is not re-queried within the TTL", async () => {
    setPlatform("linux");
    stat.mockRejectedValue(new Error("gone"));
    await getProcessStartTimesAsync([7]);
    await getProcessStartTimesAsync([7]);
    expect(stat).toHaveBeenCalledTimes(1);
  });

  it("re-queries after the TTL lapses", async () => {
    vi.useFakeTimers();
    setPlatform("linux");
    stat.mockResolvedValue({ mtimeMs: 5 });

    await getProcessStartTimesAsync([1]);
    await getProcessStartTimesAsync([1]);
    expect(stat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6000);
    await getProcessStartTimesAsync([1]);
    expect(stat).toHaveBeenCalledTimes(2);
  });
});

describe("getProcessStartTimes (sync, non-blocking)", () => {
  it("returns empty on a cold cache and never spawns synchronously", () => {
    setPlatform("linux");
    stat.mockResolvedValue({ mtimeMs: 5 });
    // Cold: nothing cached yet, so the sync call returns empty immediately.
    expect(getProcessStartTimes([1]).size).toBe(0);
  });

  it("serves values from cache once an async refresh has populated it", async () => {
    setPlatform("linux");
    stat.mockResolvedValue({ mtimeMs: 77 });
    await getProcessStartTimesAsync([1]); // warm the cache
    expect(getProcessStartTimes([1]).get(1)).toBe(77);
  });
});
