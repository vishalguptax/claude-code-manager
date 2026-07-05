import { describe, expect, it } from "vitest";
import { makeConfigData } from "../__tests__/fixtures";
import {
  buildEffortOptions,
  buildModelOptions,
  DEFAULT_MODE_OPTIONS,
  EFFORT_OPTIONS,
  formatKb,
  formatTime,
  prettyModelLabel,
} from "./index";

describe("formatTime", () => {
  it("returns a non-empty localized string for a valid timestamp", () => {
    expect(formatTime(Date.UTC(2024, 0, 2, 3, 4, 5))).not.toBe("");
  });

  it("returns empty string for non-positive or NaN input", () => {
    expect(formatTime(0)).toBe("");
    expect(formatTime(-1)).toBe("");
    expect(formatTime(Number.NaN)).toBe("");
  });
});

describe("formatKb", () => {
  it("returns bytes under 1KB", () => {
    expect(formatKb(512)).toBe("512 B");
  });

  it("returns KB with one decimal at/above 1KB", () => {
    expect(formatKb(2048)).toBe("2.0 KB");
    expect(formatKb(1536)).toBe("1.5 KB");
  });

  it("returns empty string for non-positive or NaN input", () => {
    expect(formatKb(0)).toBe("");
    expect(formatKb(-5)).toBe("");
    expect(formatKb(Number.NaN)).toBe("");
  });
});

describe("buildEffortOptions", () => {
  it("returns the canonical list for a known or empty value", () => {
    expect(buildEffortOptions("")).toBe(EFFORT_OPTIONS);
    expect(buildEffortOptions("high")).toBe(EFFORT_OPTIONS);
  });

  it("appends an unknown CLI tier so the selection is preserved", () => {
    const opts = buildEffortOptions("ultra");
    expect(opts.length).toBe(EFFORT_OPTIONS.length + 1);
    expect(opts[opts.length - 1]).toMatchObject({ value: "ultra", label: "ultra" });
  });
});

describe("buildModelOptions", () => {
  it("puts a synthetic default first that does NOT name a specific model", () => {
    const opts = buildModelOptions(makeConfigData(), "default");
    expect(opts[0].value).toBe("default");
    // No active model known → "(auto)", never a guessed model name.
    expect(opts[0].label).toBe("Default (auto)");
  });

  it("names the Default option after the active model when the statusline knows it", () => {
    const opts = buildModelOptions(makeConfigData({ activeModel: "Sonnet 4.5" }), "default");
    expect(opts[0].label).toBe("Default (Sonnet 4.5)");
  });

  it("uses the alias as value for the latest model and dedupes", () => {
    const data = makeConfigData({
      availableModels: [
        { alias: "opus", family: "opus", label: "Opus 4.7", id: "claude-opus-4-7", isLatest: true },
        { alias: "sonnet", family: "sonnet", label: "Sonnet 4", id: "claude-sonnet-4", isLatest: true },
      ],
    });
    const opts = buildModelOptions(data, "default");
    expect(opts.map((o) => o.value)).toEqual(["default", "opus", "sonnet"]);
  });

  it("does not emit two options with the same label (dated + undated same version)", () => {
    const data = makeConfigData({
      availableModels: [
        { alias: "opus", family: "opus", label: "Opus 4.8", id: "claude-opus-4-8", isLatest: true },
        // Same display version surfaced as a dated, non-latest pinned id —
        // previously rendered as a SECOND "Opus 4.8" row.
        { alias: "opus", family: "opus", label: "Opus 4.8", id: "claude-opus-4-8-20260514", isLatest: false },
      ],
    });
    const opts = buildModelOptions(data, "default");
    const opus48 = opts.filter((o) => o.label === "Opus 4.8");
    expect(opus48).toHaveLength(1);
  });

  it("appends an unknown current model so the selection never drops", () => {
    const opts = buildModelOptions(makeConfigData(), "claude-pinned-123");
    expect(opts[opts.length - 1]).toMatchObject({ value: "claude-pinned-123" });
  });

  it("prettifies an undiscovered current model and keeps the raw id as hint", () => {
    const opts = buildModelOptions(makeConfigData(), "claude-fable-5[1m]");
    expect(opts[opts.length - 1]).toMatchObject({
      value: "claude-fable-5[1m]",
      label: "Fable 5 · 1M context",
      desc: "claude-fable-5[1m]",
    });
  });
});

describe("prettyModelLabel", () => {
  it("formats family + version", () => {
    expect(prettyModelLabel("claude-fable-5")).toBe("Fable 5");
    expect(prettyModelLabel("claude-opus-4-8")).toBe("Opus 4.8");
  });

  it("labels the [1m] context variant", () => {
    expect(prettyModelLabel("claude-fable-5[1m]")).toBe("Fable 5 · 1M context");
  });

  it("passes through ids that don't fit the claude shape", () => {
    expect(prettyModelLabel("my-router/gpt-x")).toBe("my-router/gpt-x");
    expect(prettyModelLabel("claude-opus-4-20250514")).toBe("claude-opus-4-20250514");
  });
});

describe("DEFAULT_MODE_OPTIONS", () => {
  it("starts with the CLI-default empty option", () => {
    expect(DEFAULT_MODE_OPTIONS[0].value).toBe("");
  });
});
