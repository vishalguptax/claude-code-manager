import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/** Set to stand in for a different home folder within one test. */
const homeOverride = vi.hoisted(() => ({ dir: null as string | null }));
vi.mock("os", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("os");
  return { ...actual, homedir: () => homeOverride.dir ?? actual.homedir() };
});

import {
  canonicalPath,
  claudeSettingsPath,
  projectClaudeDir,
  CLAUDE_DIR,
  CLAUDE_JSON_FILE,
  FILE_HISTORY_DIR,
  SETTINGS_FILE,
} from "../config";

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

  describe("workspace whose .claude is the global one", () => {
    // Opening ~ as the folder made "project" settings.json the global file.
    it("returns null for project when the workspace is $HOME", () => {
      expect(claudeSettingsPath("project", os.homedir())).toBeNull();
      expect(claudeSettingsPath("project", os.homedir() + path.sep)).toBeNull();
      expect(claudeSettingsPath("global", os.homedir())).toBe(SETTINGS_FILE);
    });

    it.skipIf(process.platform === "win32")("sees through a symlink to $HOME", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csm-cfg-"));
      const link = path.join(dir, "home-link");
      try {
        fs.symlinkSync(os.homedir(), link);
        expect(claudeSettingsPath("project", link)).toBeNull();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it.skipIf(process.platform === "win32")(
      "sees through a symlink to $HOME before ~/.claude exists",
      () => {
        // Claude Code has never run: realpath of ~/.claude fails, so
        // comparing .claude dirs fell back to lexical paths that differ.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csm-cfg-"));
        const home = path.join(dir, "fresh-home");
        const link = path.join(dir, "home-link");
        fs.mkdirSync(home);
        fs.symlinkSync(home, link);
        homeOverride.dir = home;
        try {
          expect(fs.existsSync(path.join(home, ".claude"))).toBe(false);
          expect(claudeSettingsPath("project", link)).toBeNull();
          expect(claudeSettingsPath("project", path.join(link, "repo"))).toBe(
            path.join(link, "repo", ".claude", "settings.json"),
          );
        } finally {
          homeOverride.dir = null;
          fs.rmSync(dir, { recursive: true, force: true });
        }
      },
    );

    it.runIf(process.platform === "darwin" || process.platform === "win32")(
      "ignores case on case-insensitive platforms",
      () => {
        expect(claudeSettingsPath("project", os.homedir().toUpperCase())).toBeNull();
      },
    );

    it("keeps local scope, where Claude Code records approvals for a session in ~", () => {
      expect(claudeSettingsPath("local", os.homedir())).toBe(
        path.join(os.homedir(), ".claude", "settings.local.json"),
      );
    });

    it("gives the home folder no project dir of its own", () => {
      expect(projectClaudeDir(os.homedir())).toBeNull();
      const sub = path.join(os.homedir(), "code", "repo");
      expect(projectClaudeDir(sub)).toBe(path.join(sub, ".claude"));
    });

    it("still resolves a subfolder of $HOME", () => {
      const sub = path.join(os.homedir(), "code", "repo");
      expect(claudeSettingsPath("project", sub)).toBe(path.join(sub, ".claude", "settings.json"));
    });
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

describe("CLAUDE_JSON_FILE", () => {
  it("is ~/.claude.json, the sibling of the config directory", () => {
    expect(CLAUDE_JSON_FILE).toBe(path.join(os.homedir(), ".claude.json"));
  });
});

describe("canonicalPath", () => {
  const caseInsensitive = process.platform === "darwin" || process.platform === "win32";
  const fold = (p: string): string => (caseInsensitive ? p.toLowerCase() : p);
  let root = "";
  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cm-canon-")));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("resolves a symlink to the path it points at", () => {
    const real = path.join(root, "real");
    fs.mkdirSync(real);
    const link = path.join(root, "link");
    fs.symlinkSync(real, link, "dir");
    expect(canonicalPath(link)).toBe(fold(real));
  });

  it("keys a file not created yet the same as it will once it exists", () => {
    const real = path.join(root, "real");
    fs.mkdirSync(real);
    fs.symlinkSync(real, path.join(root, "link"), "dir");
    const viaLink = path.join(root, "link", ".claude", "settings.local.json");
    const before = canonicalPath(viaLink);
    expect(before).toBe(fold(path.join(real, ".claude", "settings.local.json")));
    fs.mkdirSync(path.join(real, ".claude"));
    fs.writeFileSync(path.join(real, ".claude", "settings.local.json"), "{}");
    expect(canonicalPath(viaLink)).toBe(before);
  });

  it("folds case only where the default filesystem ignores it", () => {
    const p = path.join(root, "No", "Such", "Dir");
    expect(canonicalPath(p)).toBe(fold(p));
  });
});
