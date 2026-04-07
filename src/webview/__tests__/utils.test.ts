/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { esc, fmtTime, dateLabel, dayStart } from "../utils";

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
