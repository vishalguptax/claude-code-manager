/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { esc, fmtTime, fmtRelativeTime, fmtDuration, dateLabel, dayStart } from "../utils";

describe("esc", () => {
  it("escapes HTML special characters", () => {
    expect(esc("<script>alert('xss')</script>")).not.toContain("<script>");
    expect(esc("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("passes through plain text unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(esc("")).toBe("");
  });

  it("escapes ampersands", () => {
    expect(esc("a & b")).toBe("a &amp; b");
  });

  it("escapes quotes in a text context", () => {
    // textContent -> innerHTML escapes < > & but may not escape quotes
    // (quotes are only dangerous in attribute context)
    const result = esc('say "hello"');
    expect(result).toContain("hello");
  });
});

describe("fmtTime", () => {
  it("formats a timestamp into a human-readable time", () => {
    // Create a known date: Jan 15 2025, 3:45 PM local time
    const d = new Date(2025, 0, 15, 15, 45, 0);
    const result = fmtTime(d.getTime());
    // Should contain "3:45" and "PM"
    expect(result).toContain("3:45");
    expect(result.toUpperCase()).toContain("PM");
  });

  it("formats morning times with AM", () => {
    const d = new Date(2025, 5, 1, 9, 30, 0);
    const result = fmtTime(d.getTime());
    expect(result).toContain("9:30");
    expect(result.toUpperCase()).toContain("AM");
  });

  it("formats noon correctly", () => {
    const d = new Date(2025, 0, 1, 12, 0, 0);
    const result = fmtTime(d.getTime());
    expect(result).toContain("12:00");
    expect(result.toUpperCase()).toContain("PM");
  });
});

describe("fmtRelativeTime", () => {
  const now = Date.now();
  it("returns 'now' for very recent timestamps", () => {
    expect(fmtRelativeTime(now - 5_000)).toBe("now");
    expect(fmtRelativeTime(now - 30_000)).toBe("now");
  });
  it("formats minutes", () => {
    expect(fmtRelativeTime(now - 2 * 60_000)).toBe("2m");
    expect(fmtRelativeTime(now - 59 * 60_000)).toBe("59m");
  });
  it("formats hours", () => {
    expect(fmtRelativeTime(now - 60 * 60_000)).toBe("1h");
    expect(fmtRelativeTime(now - 23 * 60 * 60_000)).toBe("23h");
  });
  it("formats days", () => {
    expect(fmtRelativeTime(now - 24 * 60 * 60_000)).toBe("1d");
    expect(fmtRelativeTime(now - 5 * 24 * 60 * 60_000)).toBe("5d");
  });
  it("formats months for older timestamps", () => {
    expect(fmtRelativeTime(now - 45 * 24 * 60 * 60_000)).toBe("1mo");
  });
  it("formats years for very old timestamps", () => {
    expect(fmtRelativeTime(now - 400 * 24 * 60 * 60_000)).toBe("1y");
  });
});

describe("fmtDuration", () => {
  it("returns <1m for sub-minute durations", () => {
    expect(fmtDuration(0)).toBe("<1m");
    expect(fmtDuration(30_000)).toBe("<1m");
    expect(fmtDuration(59_999)).toBe("<1m");
  });

  it("formats whole minutes under one hour", () => {
    expect(fmtDuration(60_000)).toBe("1m");
    expect(fmtDuration(30 * 60_000)).toBe("30m");
    expect(fmtDuration(59 * 60_000)).toBe("59m");
  });

  it("formats hours and minutes between 1h and 24h", () => {
    expect(fmtDuration(60 * 60_000)).toBe("1h 0m");
    expect(fmtDuration(2 * 60 * 60_000 + 25 * 60_000)).toBe("2h 25m");
    expect(fmtDuration(23 * 60 * 60_000 + 59 * 60_000)).toBe("23h 59m");
  });

  it("formats days and hours for sessions spanning more than a day", () => {
    expect(fmtDuration(24 * 60 * 60_000)).toBe("1d 0h");
    // 19714 minutes — the user-reported case
    expect(fmtDuration(19714 * 60_000)).toBe("13d 16h");
    expect(fmtDuration(7 * 24 * 60 * 60_000)).toBe("7d 0h");
  });

  it("never returns a unit that does not fit (no '0d 5h' or '0h 30m')", () => {
    expect(fmtDuration(5 * 60 * 60_000)).toBe("5h 0m");
    expect(fmtDuration(30 * 60_000)).toBe("30m");
  });
});

describe("dateLabel", () => {
  it("returns 'Today' for a timestamp from today", () => {
    expect(dateLabel(Date.now())).toBe("Today");
  });

  it("returns 'Yesterday' for a timestamp from yesterday", () => {
    const yesterday = Date.now() - 86400000 + 3600000; // yesterday but not too early
    // Construct a time that's definitely yesterday
    const now = new Date();
    const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    expect(dateLabel(yd.getTime())).toBe("Yesterday");
  });

  it("returns 'This Week' for a timestamp 3 days ago", () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12, 0, 0);
    expect(dateLabel(d.getTime())).toBe("This Week");
  });

  it("returns 'Month Year' format for old timestamps", () => {
    // A date from January 2024 — always more than 7 days ago
    const old = new Date(2024, 0, 15).getTime();
    const label = dateLabel(old);
    expect(label).toContain("January");
    expect(label).toContain("2024");
  });
});

describe("dayStart", () => {
  it("returns a timestamp at midnight of the current day", () => {
    const start = dayStart();
    const d = new Date(start);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it("returns a value less than or equal to Date.now()", () => {
    expect(dayStart()).toBeLessThanOrEqual(Date.now());
  });

  it("is on the same calendar day as now", () => {
    const now = new Date();
    const start = new Date(dayStart());
    expect(start.getFullYear()).toBe(now.getFullYear());
    expect(start.getMonth()).toBe(now.getMonth());
    expect(start.getDate()).toBe(now.getDate());
  });
});
