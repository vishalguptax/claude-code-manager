import { describe, expect, it } from "vitest";
import { describeProfileQuota } from "../profileQuota";

const HOUR = 60 * 60_000;

describe("describeProfileQuota", () => {
  const now = Date.parse("2026-09-14T12:00:00.000Z");
  const at = (iso: string, pct: number | null = 62, resetsIn = 3 * 24 * HOUR) => ({
    sevenDayPercent: pct,
    fiveHourPercent: 10,
    sevenDayResetsAt: new Date(now + resetsIn).toISOString(),
    capturedAt: iso,
  });

  it("leads with the weekly figure and dates it", () => {
    expect(describeProfileQuota(at("2026-09-14T09:00:00.000Z"), now)).toBe("62% weekly · 3h ago");
  });

  it("scales the age to a single unit", () => {
    expect(describeProfileQuota(at("2026-09-14T11:59:30.000Z"), now)).toContain("just now");
    expect(describeProfileQuota(at("2026-09-14T11:30:00.000Z"), now)).toContain("30m ago");
    expect(describeProfileQuota(at("2026-09-12T12:00:00.000Z"), now)).toContain("2d ago");
  });

  it("says nothing once the window it measured has reset", () => {
    // The percentage would describe a period that has since refilled.
    expect(describeProfileQuota(at("2026-09-14T09:00:00.000Z", 62, -HOUR), now)).toBe("");
  });

  it("says nothing about a figure older than the window itself", () => {
    expect(describeProfileQuota(at("2026-09-01T12:00:00.000Z"), now)).toBe("");
  });

  it("says nothing when there is no weekly figure, or no record at all", () => {
    expect(describeProfileQuota(at("2026-09-14T09:00:00.000Z", null), now)).toBe("");
    expect(describeProfileQuota(null, now)).toBe("");
    expect(describeProfileQuota({ ...at("nonsense"), capturedAt: "nonsense" }, now)).toBe("");
  });
});
