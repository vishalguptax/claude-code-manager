import { describe, it, expect } from "vitest";
import {
  ratesForModel,
  computeModelCost,
  PRICES_EFFECTIVE_DATE,
  WEB_SEARCH_USD_PER_REQUEST,
} from "../pricing";

describe("ratesForModel", () => {
  it("matches the opus family for any opus-* model id", () => {
    const r = ratesForModel("claude-opus-4-7-20260101");
    expect(r.input).toBeGreaterThan(0);
    // Opus is the priciest tier — sanity-check ordering vs sonnet.
    expect(r.input).toBeGreaterThan(ratesForModel("claude-sonnet-4-6").input);
  });

  it("matches the sonnet family for any sonnet-* model id", () => {
    const r = ratesForModel("claude-sonnet-4-6");
    expect(r.input).toBe(3);
    expect(r.output).toBe(15);
  });

  it("matches the haiku family for any haiku-* model id", () => {
    const r = ratesForModel("claude-haiku-4-5-20251001");
    expect(r.input).toBe(1);
    expect(r.output).toBe(5);
  });

  it("falls back to a non-zero default for unknown ids so cost never silently shows $0", () => {
    const r = ratesForModel("future-unknown-model");
    expect(r.input).toBeGreaterThan(0);
    expect(r.output).toBeGreaterThan(0);
  });

  it("matches case-insensitively", () => {
    expect(ratesForModel("CLAUDE-OPUS-4-7").input).toBe(5);
  });

  it("matches the fable family above opus pricing", () => {
    const r = ratesForModel("claude-fable-5");
    expect(r.input).toBe(10);
    expect(r.output).toBe(50);
    expect(r.input).toBeGreaterThan(ratesForModel("claude-opus-4-8").input);
  });

  it("matches the fable family for the 1M-context variant id", () => {
    expect(ratesForModel("claude-fable-5[1m]").input).toBe(10);
  });

  it("prices mythos identically to fable (same tier)", () => {
    expect(ratesForModel("claude-mythos-5")).toEqual(ratesForModel("claude-fable-5"));
  });

  it("prices Sonnet 5 below Sonnet 4.6 — the family row alone got this wrong", () => {
    const s5 = ratesForModel("claude-sonnet-5");
    expect(s5.input).toBe(2);
    expect(s5.output).toBe(10);
    expect(s5.input).toBeLessThan(ratesForModel("claude-sonnet-4-6").input);
  });

  it("gives Fable 5.1 the 0.025x cache-read rate, not the standard 0.1x", () => {
    expect(ratesForModel("claude-fable-5-1").cacheRead).toBe(0.25);
    expect(ratesForModel("claude-fable-5").cacheRead).toBe(1);
  });

  it("prices cache writes by TTL — 1.25x base input at 5m, 2x at 1h", () => {
    for (const id of ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"]) {
      const r = ratesForModel(id);
      expect(r.cacheWrite5m).toBeCloseTo(r.input * 1.25, 6);
      expect(r.cacheWrite1h).toBeCloseTo(r.input * 2, 6);
    }
  });

  it("keeps retired Opus 4 / 4.1 on their own $15 tier", () => {
    expect(ratesForModel("claude-opus-4-1-20250805").input).toBe(15);
    expect(ratesForModel("claude-opus-4-20250514").input).toBe(15);
    // Current Opus must not be caught by that row.
    expect(ratesForModel("claude-opus-5").input).toBe(5);
    expect(ratesForModel("claude-opus-4-8").input).toBe(5);
  });

  it("resolves the 1M-context suffix Claude Code appends to opus ids", () => {
    expect(ratesForModel("claude-opus-5[1m]").input).toBe(5);
  });
});

describe("computeModelCost", () => {
  it("returns 0 when no token buckets are supplied", () => {
    expect(computeModelCost("claude-opus-4-7", {})).toBe(0);
  });

  it("computes input + output cost for opus", () => {
    // 1M input tokens × $5 + 1M output tokens × $25 = $30.
    const cost = computeModelCost("claude-opus-4-7", {
      input: 1_000_000,
      output: 1_000_000,
    });
    expect(cost).toBe(30);
  });

  it("includes cache buckets when provided (cache-read is far cheaper than input)", () => {
    const inputOnly = computeModelCost("claude-sonnet-4-6", { input: 1_000_000 });
    const withCacheRead = computeModelCost("claude-sonnet-4-6", {
      input: 1_000_000,
      cacheRead: 1_000_000,
    });
    expect(withCacheRead).toBeGreaterThan(inputOnly);
    // Cache-read is roughly 10% of input rate, so the delta should be
    // small — guarding against accidentally swapping fields would
    // otherwise show a huge jump.
    expect(withCacheRead - inputOnly).toBeLessThan(inputOnly);
  });

  it("scales linearly with token counts", () => {
    const single = computeModelCost("claude-haiku-4-5", { input: 1_000_000 });
    const triple = computeModelCost("claude-haiku-4-5", { input: 3_000_000 });
    expect(triple).toBeCloseTo(single * 3, 6);
  });

  it("charges 1h cache writes at 2x input, not the 5m 1.25x", () => {
    const at5m = computeModelCost("claude-opus-5", { cacheWrite: 1_000_000 });
    const at1h = computeModelCost("claude-opus-5", {
      cacheWrite: 1_000_000,
      cacheWrite1h: 1_000_000,
    });
    expect(at5m).toBeCloseTo(6.25, 6);
    expect(at1h).toBeCloseTo(10, 6);
  });

  it("splits a mixed cache write across both TTL rates", () => {
    const cost = computeModelCost("claude-opus-5", {
      cacheWrite: 1_000_000,
      cacheWrite1h: 400_000,
    });
    expect(cost).toBeCloseTo((600_000 * 6.25 + 400_000 * 10) / 1_000_000, 6);
  });

  it("treats a 1h subset larger than the total as all-1h rather than going negative", () => {
    const cost = computeModelCost("claude-opus-5", {
      cacheWrite: 1_000,
      cacheWrite1h: 9_999,
    });
    expect(cost).toBeCloseTo((1_000 * 10) / 1_000_000, 9);
  });

  it("adds $10 per 1,000 web searches on top of tokens", () => {
    expect(WEB_SEARCH_USD_PER_REQUEST).toBeCloseTo(0.01, 9);
    const cost = computeModelCost("claude-opus-5", { webSearchRequests: 250 });
    expect(cost).toBeCloseTo(2.5, 6);
  });

  it("applies no long-context surcharge — the 1M window bills at standard rates", () => {
    const small = computeModelCost("claude-opus-5", { input: 9_000 });
    const large = computeModelCost("claude-opus-5", { input: 900_000 });
    expect(large).toBeCloseTo(small * 100, 6);
  });
});

describe("PRICES_EFFECTIVE_DATE", () => {
  it("is a YYYY-MM-DD string so the UI can render it directly", () => {
    expect(PRICES_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { compareModelRecencyDesc, modelRecency } from "../pricing";

describe("modelRecency", () => {
  it("scores newer model versions higher", () => {
    expect(modelRecency("claude-opus-4-7")).toBeGreaterThan(modelRecency("claude-opus-4-5"));
    expect(modelRecency("claude-sonnet-4-6")).toBeGreaterThan(modelRecency("claude-sonnet-4-0"));
  });

  it("returns -1 for non-Claude / unknown models", () => {
    expect(modelRecency("gpt-5-turbo")).toBe(-1);
    expect(modelRecency("")).toBe(-1);
  });

  it("ignores dated suffix in id", () => {
    expect(modelRecency("claude-sonnet-4-5-20250929")).toBe(modelRecency("claude-sonnet-4-5"));
  });

  it("scores new families (fable) without a code change", () => {
    expect(modelRecency("claude-fable-5")).toBeGreaterThan(modelRecency("claude-opus-4-8"));
  });
});

describe("compareModelRecencyDesc", () => {
  it("sorts newer models first", () => {
    const list = [
      { model: "claude-sonnet-4-5", totalTokens: 100 },
      { model: "claude-opus-4-7", totalTokens: 1 },
      { model: "claude-haiku-3-5", totalTokens: 999 },
    ];
    list.sort(compareModelRecencyDesc);
    expect(list.map((m) => m.model)).toEqual([
      "claude-opus-4-7",
      "claude-sonnet-4-5",
      "claude-haiku-3-5",
    ]);
  });

  it("breaks ties by higher totalTokens", () => {
    const list = [
      { model: "claude-opus-4-7", totalTokens: 50 },
      { model: "claude-opus-4-7-20260101", totalTokens: 200 },
    ];
    list.sort(compareModelRecencyDesc);
    expect(list[0].totalTokens).toBe(200);
  });

  it("unknown models go to the bottom", () => {
    const list = [
      { model: "gpt-4", totalTokens: 9999 },
      { model: "claude-haiku-3-5", totalTokens: 1 },
    ];
    list.sort(compareModelRecencyDesc);
    expect(list[0].model).toBe("claude-haiku-3-5");
  });
});
