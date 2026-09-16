import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import { claudeSettingsPath, CLAUDE_DIR, FILE_HISTORY_DIR, SETTINGS_FILE } from "../config";

const ws = path.join("C:", "work", "repo");

describe("claudeSettingsPath", () => {
  it("resolves global scope to ~/.claude/settings.json regardless of workspace", () => {
    const expected = path.join(os.homedir(), ".claude", "settings.json");
    expect(claudeSettingsPath("global")).toBe(expected);
    expect(claudeSettingsPath("global", ws)).toBe(expected);
    expect(claudeSettingsPath("global")).toBe(SETTINGS_FILE);
  });

  it("resolves project scope inside the workspace .claude dir", () => {
    expect(claudeSettingsPath("project", ws)).toBe(path.join(ws, ".claude", "settings.json"));
  });

  it("resolves local scope to settings.local.json", () => {
    expect(claudeSettingsPath("local", ws)).toBe(path.join(ws, ".claude", "settings.local.json"));
  });

  it("returns null for project/local without a workspace", () => {
    expect(claudeSettingsPath("project")).toBeNull();
    expect(claudeSettingsPath("local")).toBeNull();
  });
});

describe("FILE_HISTORY_DIR", () => {
  it("points at Claude Code's per-file backup tree", () => {
    // The blob layout underneath is <sessionId>/<pathHash>@v<N>; the feature
    // depends on this root being exactly where the CLI writes it.
    expect(FILE_HISTORY_DIR).toBe(path.join(os.homedir(), ".claude", "file-history"));
    expect(FILE_HISTORY_DIR).toBe(path.join(CLAUDE_DIR, "file-history"));
  });
});
