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
