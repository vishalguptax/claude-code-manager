import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import {
  CLAUDE_DIR,
  HISTORY_FILE,
  PROJECTS_DIR,
  SESSIONS_DIR,
  STATE_FILE,
  STATS_CACHE_FILE,
  SETTINGS_FILE,
  MCP_AUTH_CACHE_FILE,
  SESSION_META_READ_BYTES,
  SETTINGS_SNAPSHOTS_DIR,
  CLAUDE_MANAGER_DIR,
  STATUSLINE_CACHE_FILE,
  STATUSLINE_TAP_FILE,
  STATUSLINE_INNER_FILE,
  SESSION_TAP_FILE,
  SESSION_ACTIVE_FILE,
} from "./config";

describe("config", () => {
  describe("paths", () => {
    it("should define CLAUDE_DIR as ~/.claude", () => {
      const expected = path.join(os.homedir(), ".claude");
      expect(CLAUDE_DIR).toBe(expected);
    });

    it("should define HISTORY_FILE under CLAUDE_DIR", () => {
      expect(HISTORY_FILE).toContain(".claude");
      expect(HISTORY_FILE).toContain("history.jsonl");
    });

    it("should define PROJECTS_DIR for session files", () => {
      expect(PROJECTS_DIR).toContain(".claude");
      expect(PROJECTS_DIR).toContain("projects");
    });

    it("should define SESSIONS_DIR for session metadata", () => {
      expect(SESSIONS_DIR).toContain(".claude");
      expect(SESSIONS_DIR).toContain("sessions");
    });

    it("should define STATE_FILE for extension state", () => {
      expect(STATE_FILE).toContain(".csm-state.json");
      expect(STATE_FILE).toContain(".claude");
    });

    it("should define CLAUDE_MANAGER_DIR for extension state", () => {
      expect(CLAUDE_MANAGER_DIR).toContain(".claude-manager");
    });
  });

  describe("constants", () => {
    it("should define SESSION_META_READ_BYTES", () => {
      expect(SESSION_META_READ_BYTES).toBe(4096);
      expect(SESSION_META_READ_BYTES).toBeGreaterThan(0);
    });

    it("should define all paths as strings", () => {
      expect(typeof CLAUDE_DIR).toBe("string");
      expect(typeof HISTORY_FILE).toBe("string");
    });
  });

  describe("path consistency", () => {
    it("all .claude paths should be under CLAUDE_DIR", () => {
      const underClaude = [
        HISTORY_FILE,
        PROJECTS_DIR,
        SESSIONS_DIR,
        STATE_FILE,
        SETTINGS_FILE,
      ];

      underClaude.forEach((filePath) => {
        expect(filePath.startsWith(CLAUDE_DIR)).toBe(true);
      });
    });
  });
});
