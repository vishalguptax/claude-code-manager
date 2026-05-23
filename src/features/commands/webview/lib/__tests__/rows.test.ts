// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "../../../types";
import { buildRows, copyCommand, groupLabel, previewText } from "../rows";

function cmd(partial: Partial<Command> & Pick<Command, "name" | "scope">): Command {
  return { content: "", path: "", ...partial };
}

describe("groupLabel", () => {
  it("labels each scope, including plugin name and the unknown fallback", () => {
    expect(groupLabel(cmd({ name: "a", scope: "builtin" }))).toBe("Built-in");
    expect(groupLabel(cmd({ name: "a", scope: "project" }))).toBe("Project Commands");
    expect(groupLabel(cmd({ name: "a", scope: "global" }))).toBe("Global Commands");
    expect(groupLabel(cmd({ name: "a", scope: "plugin", pluginName: "x@y" }))).toBe("Plugin: x@y");
    expect(groupLabel(cmd({ name: "a", scope: "plugin" }))).toBe("Plugin: unknown");
  });
});

describe("buildRows", () => {
  it("emits a header before each new scope group and one item per command", () => {
    const rows = buildRows([
      cmd({ name: "clear", scope: "builtin" }),
      cmd({ name: "review", scope: "project" }),
      cmd({ name: "deploy", scope: "project" }),
    ]);
    expect(rows.map((r) => (r.kind === "header" ? `H:${r.label}` : `I:${r.command.name}`))).toEqual(
      ["H:Built-in", "I:clear", "H:Project Commands", "I:review", "I:deploy"],
    );
  });

  it("returns an empty list for no commands", () => {
    expect(buildRows([])).toEqual([]);
  });
});

describe("previewText", () => {
  it("uses the description for builtin commands and content otherwise", () => {
    expect(previewText(cmd({ name: "a", scope: "builtin", description: "hi" }))).toBe("hi");
    expect(previewText(cmd({ name: "a", scope: "project", content: "do it" }))).toBe("do it");
  });

  it("collapses newlines and truncates past 80 chars", () => {
    expect(previewText(cmd({ name: "a", scope: "project", content: "x\ny" }))).toBe("x y");
    const preview = previewText(cmd({ name: "a", scope: "project", content: "x".repeat(200) }));
    expect(preview.endsWith("...")).toBe(true);
    expect(preview.length).toBe(83);
  });
});

describe("copyCommand", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn() },
      configurable: true,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("writes the slash-prefixed name to the clipboard", () => {
    copyCommand(cmd({ name: "review", scope: "project" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/review");
  });
});
