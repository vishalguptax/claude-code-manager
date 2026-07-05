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

import {
  mergeCaches,
  resolveActiveModel,
  SESSION_CAPTURE_MAX,
  SESSION_CAPTURE_TTL_MS,
  SESSION_FRESH_MS,
  type StatuslineCache,
} from "../statuslineCore";

function cacheWith(
  sessions: NonNullable<StatuslineCache["sessions"]>,
  model: StatuslineCache["model"] = null,
): StatuslineCache {
  return {
    capturedAt: 0,
    version: "2.1.201",
    model,
    context: null,
    cost: null,
    rateLimits: { fiveHour: null, sevenDay: null },
    sessions,
  };
}

const NOW = 1_800_000_000_000;
const fable = { id: "claude-fable-5", displayName: "Fable 5" };
const opus = { id: "claude-opus-4-8", displayName: "Opus 4.8" };
const sonnet = { id: "claude-sonnet-5", displayName: "Sonnet 5" };

describe("extractCache — sessions", () => {
  it("records the render under its session_id", () => {
    const cache = extractCache(
      JSON.stringify({
        session_id: "s-1",
        model: { id: "claude-fable-5", display_name: "Fable 5" },
      }),
      NOW,
    )!;
    expect(cache.sessions).toEqual({
      "s-1": { model: fable, capturedAt: NOW },
    });
  });

  it("yields an empty sessions map when the payload has no session_id", () => {
    const cache = extractCache(JSON.stringify({ model: { id: "x" } }), NOW)!;
    expect(cache.sessions).toEqual({});
  });
});

describe("mergeCaches", () => {
  it("unions sessions across renders; fresh render wins its own slot", () => {
    const prev = cacheWith({
      "s-opus": { model: opus, capturedAt: NOW - 60_000 },
      "s-fable": { model: sonnet, capturedAt: NOW - 120_000 },
    });
    const fresh = cacheWith({ "s-fable": { model: fable, capturedAt: NOW } }, fable);
    const merged = mergeCaches(prev, fresh, NOW);
    expect(merged.sessions).toEqual({
      "s-opus": { model: opus, capturedAt: NOW - 60_000 },
      "s-fable": { model: fable, capturedAt: NOW },
    });
    // Top-level stays last-writer (backwards compatible).
    expect(merged.model).toEqual(fable);
  });

  it("prunes captures older than the TTL", () => {
    const prev = cacheWith({
      old: { model: opus, capturedAt: NOW - SESSION_CAPTURE_TTL_MS - 1 },
    });
    const merged = mergeCaches(prev, cacheWith({ new: { model: fable, capturedAt: NOW } }), NOW);
    expect(Object.keys(merged.sessions!)).toEqual(["new"]);
  });

  it("caps retained captures at the newest SESSION_CAPTURE_MAX", () => {
    const many: NonNullable<StatuslineCache["sessions"]> = {};
    for (let i = 0; i < SESSION_CAPTURE_MAX + 5; i++) {
      many[`s-${i}`] = { model: opus, capturedAt: NOW - i * 1000 };
    }
    const merged = mergeCaches(cacheWith(many), cacheWith({}), NOW);
    expect(Object.keys(merged.sessions!)).toHaveLength(SESSION_CAPTURE_MAX);
    expect(merged.sessions!["s-0"]).toBeDefined();
    expect(merged.sessions![`s-${SESSION_CAPTURE_MAX + 4}`]).toBeUndefined();
  });

  it("tolerates a null previous cache (first render)", () => {
    const merged = mergeCaches(null, cacheWith({ s: { model: fable, capturedAt: NOW } }), NOW);
    expect(Object.keys(merged.sessions!)).toEqual(["s"]);
  });
});

describe("resolveActiveModel", () => {
  it("returns the model when every fresh session agrees", () => {
    const cache = cacheWith(
      {
        a: { model: fable, capturedAt: NOW - 1000 },
        b: { model: fable, capturedAt: NOW - 2000 },
      },
      fable,
    );
    expect(resolveActiveModel(cache, NOW)).toBe("Fable 5");
  });

  it("returns null when fresh sessions run DIFFERENT models (no honest claim)", () => {
    const cache = cacheWith(
      {
        a: { model: fable, capturedAt: NOW - 1000 },
        b: { model: opus, capturedAt: NOW - 2000 },
        c: { model: sonnet, capturedAt: NOW - 3000 },
      },
      // Last writer happened to be sonnet — must NOT be claimed.
      sonnet,
    );
    expect(resolveActiveModel(cache, NOW)).toBeNull();
  });

  it("falls back to the last-known top-level model when no session is fresh", () => {
    const cache = cacheWith(
      { a: { model: fable, capturedAt: NOW - SESSION_FRESH_MS - 1 } },
      opus,
    );
    expect(resolveActiveModel(cache, NOW)).toBe("Opus 4.8");
  });

  it("handles caches written by older taps (no sessions map)", () => {
    const cache = cacheWith({}, sonnet);
    delete cache.sessions;
    expect(resolveActiveModel(cache, NOW)).toBe("Sonnet 5");
    expect(resolveActiveModel(null, NOW)).toBeNull();
  });
});
