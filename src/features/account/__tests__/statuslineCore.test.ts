import { describe, expect, it } from "vitest";
import { extractCache, renderDefaultLine } from "../statuslineCore";

/** A realistic statusline payload, mirroring what Claude Code emits. */
const PAYLOAD = JSON.stringify({
  session_id: "abc",
  version: "2.1.86",
  model: { id: "claude-opus-4-6", display_name: "Opus 4.6 (1M context)" },
  context_window: { used_percentage: 3, context_window_size: 1_000_000 },
  cost: {
    total_cost_usd: 0.97,
    total_duration_ms: 612_839,
    total_lines_added: 214,
    total_lines_removed: 179,
  },
  rate_limits: {
    five_hour: { used_percentage: 6, resets_at: 1_774_731_600 },
    seven_day: { used_percentage: 12, resets_at: 1_775_199_600 },
  },
});

describe("extractCache", () => {
  it("normalises a full payload and stamps the injected time", () => {
    const cache = extractCache(PAYLOAD, 1234);
    expect(cache).not.toBeNull();
    if (!cache) return;
    expect(cache.capturedAt).toBe(1234);
    expect(cache.version).toBe("2.1.86");
    expect(cache.model).toEqual({ id: "claude-opus-4-6", displayName: "Opus 4.6 (1M context)" });
    expect(cache.context).toEqual({ usedPercent: 3, size: 1_000_000 });
    expect(cache.cost).toEqual({
      totalUsd: 0.97,
      durationMs: 612_839,
      linesAdded: 214,
      linesRemoved: 179,
    });
    expect(cache.rateLimits.fiveHour).toEqual({ usedPercent: 6, resetsAt: 1_774_731_600 });
    expect(cache.rateLimits.sevenDay).toEqual({ usedPercent: 12, resetsAt: 1_775_199_600 });
  });

  it("returns null for non-JSON input", () => {
    expect(extractCache("<not json>", 0)).toBeNull();
  });

  it("returns null for a JSON primitive (not an object)", () => {
    expect(extractCache("42", 0)).toBeNull();
  });

  it("yields nulls for absent sections rather than throwing", () => {
    const cache = extractCache(JSON.stringify({ version: "2.0.0" }), 9);
    expect(cache).not.toBeNull();
    if (!cache) return;
    expect(cache.model).toBeNull();
    expect(cache.context).toBeNull();
    expect(cache.cost).toBeNull();
    expect(cache.rateLimits.fiveHour).toBeNull();
    expect(cache.rateLimits.sevenDay).toBeNull();
  });

  it("drops a rate window that has no numeric used_percentage", () => {
    const cache = extractCache(
      JSON.stringify({ rate_limits: { five_hour: { resets_at: 1 }, seven_day: null } }),
      0,
    );
    expect(cache?.rateLimits.fiveHour).toBeNull();
    expect(cache?.rateLimits.sevenDay).toBeNull();
  });
});

describe("renderDefaultLine", () => {
  it("joins the segments the payload provided", () => {
    const cache = extractCache(PAYLOAD, 0)!;
    expect(renderDefaultLine(cache)).toBe("Opus 4.6 (1M context)  ·  ctx 3%  ·  5h 6%  ·  7d 12%");
  });

  it("is empty when no segment has data", () => {
    const cache = extractCache(JSON.stringify({ version: "x" }), 0)!;
    expect(renderDefaultLine(cache)).toBe("");
  });
});
