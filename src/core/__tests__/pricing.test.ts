import { describe, it, expect } from "vitest";
import {
  ratesForModel,
  computeModelCost,
  PRICES_EFFECTIVE_DATE,
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
    expect(ratesForModel("CLAUDE-OPUS-4-7").input).toBe(15);
  });
});

describe("computeModelCost", () => {
  it("returns 0 when no token buckets are supplied", () => {
    expect(computeModelCost("claude-opus-4-7", {})).toBe(0);
  });

  it("computes input + output cost for opus", () => {
    // 1M input tokens × $15 + 1M output tokens × $75 = $90.
    const cost = computeModelCost("claude-opus-4-7", {
      input: 1_000_000,
      output: 1_000_000,
    });
    expect(cost).toBe(90);
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
});

describe("PRICES_EFFECTIVE_DATE", () => {
  it("is a YYYY-MM-DD string so the UI can render it directly", () => {
    expect(PRICES_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
