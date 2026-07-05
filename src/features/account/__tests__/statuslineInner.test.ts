import { describe, expect, it } from "vitest";
import {
  isTapCommand,
  isV2,
  parseInner,
  resolveChainCommand,
  type InnerRecordV2,
} from "../statuslineInner";

const V2: InnerRecordV2 = {
  version: 2,
  global: { priorCommand: "global-bar.sh" },
  workspaces: {
    "/ws-a": { sourceScope: "project", priorCommand: "a-bar.sh" },
    "/ws-b": { sourceScope: "local", priorCommand: "" },
  },
};

describe("parseInner", () => {
  it("parses a v2 record", () => {
    const rec = parseInner(JSON.stringify(V2))!;
    expect(isV2(rec)).toBe(true);
    expect(rec).toEqual(V2);
  });

  it("parses a v1 record for migration", () => {
    const rec = parseInner(
      JSON.stringify({ scope: "project", command: "x.sh", workspacePath: "/ws" }),
    )!;
    expect(isV2(rec)).toBe(false);
    expect(rec).toEqual({ scope: "project", command: "x.sh", workspacePath: "/ws" });
  });

  it("returns null for garbage, wrong shapes, and non-objects", () => {
    expect(parseInner("{not json")).toBeNull();
    expect(parseInner("42")).toBeNull();
    expect(parseInner(JSON.stringify({ scope: "galaxy" }))).toBeNull();
  });

  it("drops malformed workspace entries instead of failing the record", () => {
    const rec = parseInner(
      JSON.stringify({
        version: 2,
        global: null,
        workspaces: {
          "/good": { sourceScope: "local", priorCommand: "ok.sh" },
          "/bad": { sourceScope: "galaxy", priorCommand: "x" },
          "/worse": "not-an-object",
        },
      }),
    )!;
    expect(isV2(rec) && Object.keys(rec.workspaces)).toEqual(["/good"]);
  });
});

describe("resolveChainCommand", () => {
  it("prefers the workspace override for its project dir", () => {
    expect(resolveChainCommand(V2, "/ws-a")).toBe("a-bar.sh");
  });

  it("honours an empty workspace prior (statusline intentionally bare)", () => {
    expect(resolveChainCommand(V2, "/ws-b")).toBe("");
  });

  it("falls back to the global prior for unknown dirs", () => {
    expect(resolveChainCommand(V2, "/elsewhere")).toBe("global-bar.sh");
    expect(resolveChainCommand(V2, "")).toBe("global-bar.sh");
  });

  it("chains a v1 record's single command (old sidecar, new tap)", () => {
    expect(
      resolveChainCommand({ scope: "global", command: "old.sh" }, "/anything"),
    ).toBe("old.sh");
  });

  it("returns empty for a missing record", () => {
    expect(resolveChainCommand(null, "/ws-a")).toBe("");
  });
});

describe("isTapCommand", () => {
  it("matches this machine's and foreign machines' tap paths", () => {
    expect(isTapCommand('"/usr/bin/node" "/Users/x/.claude/.claude-manager/statusline-tap.js"')).toBe(true);
    expect(
      isTapCommand('"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\winuser\\.claude\\.claude-manager\\statusline-tap.js"'),
    ).toBe(true);
  });

  it("does not match user statuslines", () => {
    expect(isTapCommand("~/.claude/statusline-command.sh")).toBe(false);
    expect(isTapCommand("")).toBe(false);
  });
});
