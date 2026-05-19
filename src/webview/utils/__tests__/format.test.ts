import { describe, it, expect } from "vitest";
import { formatBytes, formatRelativeTime, formatDate } from "../format";

describe("formatBytes", () => {
  it("formats bytes under 1 KB", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("formatRelativeTime", () => {
  it("returns 'now' for very recent timestamps", () => {
    expect(formatRelativeTime(Date.now() - 1000)).toBe("now");
  });

  it("returns minutes for sub-hour ranges", () => {
    expect(formatRelativeTime(Date.now() - 5 * 60 * 1000)).toBe("5m");
  });
});

describe("formatDate", () => {
  it("returns a non-empty string for valid timestamps", () => {
    expect(formatDate(Date.now())).toMatch(/\d/);
  });
});
