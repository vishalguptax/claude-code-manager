import { afterEach, describe, it, expect, vi } from "vitest";
import * as vscode from "vscode";
import { __internals, reportIssueCommand } from "../commands";


afterEach(() => vi.restoreAllMocks());

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

describe("reportIssueCommand", () => {
  it("copies the full report when the user picks Copy", async () => {
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue("Copy report" as never);
    const write = vi.spyOn(vscode.env.clipboard, "writeText").mockResolvedValue();
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined as never);

    await reportIssueCommand();

    expect(write).toHaveBeenCalledWith(expect.stringContaining("### Environment"));
  });

  it("opens the prefilled issue form, and still copies the untruncated report", async () => {
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue("Open GitHub issue" as never);
    const write = vi.spyOn(vscode.env.clipboard, "writeText").mockResolvedValue();
    const open = vi.spyOn(vscode.env, "openExternal").mockResolvedValue(true);

    await reportIssueCommand();

    expect(write).toHaveBeenCalled();
    const uri = open.mock.calls[0]?.[0] as { toString(): string };
    expect(String(uri)).toContain("/issues/new?");
  });

  it("does nothing when the picker is dismissed", async () => {
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue(undefined as never);
    const write = vi.spyOn(vscode.env.clipboard, "writeText").mockResolvedValue();

    await reportIssueCommand();

    expect(write).not.toHaveBeenCalled();
  });
});
