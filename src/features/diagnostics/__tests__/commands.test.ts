import { describe, it, expect } from "vitest";
import { __internals } from "../commands";

const { formatReport, compareSemver } = __internals;

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.85.0", "1.85.0")).toBe(0);
  });
  it("returns positive when left is newer", () => {
    expect(compareSemver("1.86.0", "1.85.0")).toBeGreaterThan(0);
    expect(compareSemver("2.0.0", "1.85.0")).toBeGreaterThan(0);
  });
  it("returns negative when left is older", () => {
    expect(compareSemver("1.84.0", "1.85.0")).toBeLessThan(0);
  });
  it("treats missing components as zero", () => {
    expect(compareSemver("1.85", "1.85.0")).toBe(0);
  });
});

describe("formatReport", () => {
  it("renders a markdown table with one row per check", () => {
    const md = formatReport([
      { id: "a", label: "First", status: "pass", detail: "all good" },
      { id: "b", label: "Second", status: "warn", detail: "iffy" },
      { id: "c", label: "Third", status: "fail", detail: "broken", fixHint: "fix it" },
    ]);
    expect(md).toContain("# Claude Code Manager — Diagnostic report");
    expect(md).toContain("1 pass · 1 warn · 1 fail");
    expect(md).toContain("| First |");
    expect(md).toContain("[ OK ]");
    expect(md).toContain("[WARN]");
    expect(md).toContain("[FAIL]");
    // Fix hints section appears only because at least one check has one.
    expect(md).toContain("## Fix hints");
    expect(md).toContain("**Third** — fix it");
  });

  it("escapes pipes inside detail so they don't break the markdown table", () => {
    const md = formatReport([
      { id: "a", label: "x", status: "pass", detail: "a|b|c" },
    ]);
    // Each pipe in detail must become escaped so the table column count stays right.
    const row = md.split("\n").find((l) => l.includes("| x |"));
    expect(row).toBeDefined();
    expect(row!).toContain("a\\|b\\|c");
  });

  it("omits the fix-hints section when no check provides one", () => {
    const md = formatReport([
      { id: "a", label: "x", status: "pass", detail: "ok" },
    ]);
    expect(md).not.toContain("## Fix hints");
  });
});
