import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * State the mocks read. `cache` is the raw statusline.json contents (or
 * null to simulate a missing file); `installed` drives the mocked
 * install check that distinguishes not-installed from no-data.
 */
const state = vi.hoisted(() => ({
  cache: null as string | null,
  installed: true,
}));

vi.mock("fs", () => ({
  readFileSync: (p: string): string => {
    if (typeof p === "string" && p.endsWith("statusline.json")) {
      if (state.cache === null) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return state.cache;
    }
    return "";
  },
}));

vi.mock("../statuslineInstall", () => ({
  isStatuslineInstalled: () => state.installed,
}));

import { readQuota } from "../quota";

/** A StatuslineCache as the tap would have written it. */
const CACHE = JSON.stringify({
  capturedAt: 1_700_000_000_000,
  version: "2.1.86",
  model: { id: "claude-opus-4-6", displayName: "Opus 4.6 (1M context)" },
  context: { usedPercent: 3, size: 1_000_000 },
  cost: { totalUsd: 0.97, durationMs: 1, linesAdded: 214, linesRemoved: 179 },
  rateLimits: {
    fiveHour: { usedPercent: 6, resetsAt: 1_774_731_600 },
    sevenDay: { usedPercent: 12, resetsAt: 1_775_199_600 },
  },
});

beforeEach(() => {
  state.cache = null;
  state.installed = true;
});

describe("readQuota", () => {
  it("reports not-installed when the cache is absent and the tap isn't wired", () => {
    state.cache = null;
    state.installed = false;
    const result = readQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-installed");
  });

  it("reports no-data when installed but the cache hasn't been written", () => {
    state.cache = null;
    state.installed = true;
    const result = readQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-data");
  });

  it("treats a corrupt cache as no-data (a rerun rewrites it)", () => {
    state.cache = "{ not valid json";
    state.installed = true;
    const result = readQuota();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("no-data");
  });

  it("maps a full cache to quota windows + live session", () => {
    state.cache = CACHE;
    const result = readQuota();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.quota.fiveHour).toEqual({
      utilization: 6,
      resetsAt: new Date(1_774_731_600 * 1000).toISOString(),
    });
    expect(result.data.quota.sevenDay?.utilization).toBe(12);
    expect(result.data.quota.capturedAt).toBe(new Date(1_700_000_000_000).toISOString());

    expect(result.data.live.model).toBe("Opus 4.6 (1M context)");
    expect(result.data.live.contextUsedPercent).toBe(3);
    expect(result.data.live.sessionCostUsd).toBe(0.97);
    expect(result.data.live.linesAdded).toBe(214);
    expect(result.data.live.version).toBe("2.1.86");
  });

  it("yields null windows + null live fields when the cache omits them", () => {
    state.cache = JSON.stringify({
      capturedAt: 1_700_000_000_000,
      version: "",
      model: null,
      context: null,
      cost: null,
      rateLimits: { fiveHour: null, sevenDay: null },
    });
    const result = readQuota();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.quota.fiveHour).toBeNull();
    expect(result.data.quota.sevenDay).toBeNull();
    expect(result.data.live.model).toBe("");
    expect(result.data.live.contextUsedPercent).toBeNull();
    expect(result.data.live.sessionCostUsd).toBeNull();
  });

  it("blanks a reset time of 0", () => {
    state.cache = JSON.stringify({
      capturedAt: 1_700_000_000_000,
      version: "",
      model: null,
      context: null,
      cost: null,
      rateLimits: { fiveHour: { usedPercent: 5, resetsAt: 0 }, sevenDay: null },
    });
    const result = readQuota();
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.quota.fiveHour).toEqual({ utilization: 5, resetsAt: "" });
  });
});
