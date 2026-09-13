/**
 * Permission-parsing contract for the account/config payload.
 *
 * This is the test that was missing while the Permissions view shipped — the
 * full host→webview path (parse → message → render) is exercised elsewhere, but
 * nothing pinned the actual SHAPE the parser produces from a realistic
 * settings.json. Without it, a regression in `parsePermissions` /
 * `readPermissionFile` (wrong scope file, dropped allow/deny, missing
 * additionalDirectories) would surface only as a silently-empty Permissions
 * view in the running extension.
 *
 * Strategy: pin CLAUDE_DIR to a temp dir, write a real global settings.json and
 * a temp workspace with project (`settings.json`) + local
 * (`settings.local.json`) files, then assert `parseAccountData` returns the
 * allow/deny entries keyed to the right scope and surfaces
 * additionalDirectories from the global file.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const tmp = vi.hoisted(() => {
  const fsLocal = require("fs") as typeof import("fs");
  const osLocal = require("os") as typeof import("os");
  const pathLocal = require("path") as typeof import("path");
  const root = fsLocal.mkdtempSync(pathLocal.join(osLocal.tmpdir(), "cm-perm-"));
  return { root };
});

vi.mock("../../../core/config", () => ({
  CLAUDE_DIR: tmp.root,
  HISTORY_FILE: path.join(tmp.root, "history.jsonl"),
  PROJECTS_DIR: path.join(tmp.root, "projects"),
  SESSIONS_DIR: path.join(tmp.root, "sessions"),
  STATE_FILE: path.join(tmp.root, ".csm-state.json"),
  STATS_CACHE_FILE: path.join(tmp.root, "stats-cache.json"),
  SETTINGS_FILE: path.join(tmp.root, "settings.json"),
  SESSION_META_READ_BYTES: 4096,
  SETTINGS_SNAPSHOTS_DIR: path.join(tmp.root, "snapshots"),
  claudeSettingsPath: (scope: string, workspacePath?: string) => {
    if (scope === "global") return path.join(tmp.root, "settings.json");
    if (!workspacePath) return null;
    const name = scope === "local" ? "settings.local.json" : "settings.json";
    return path.join(workspacePath, ".claude", name);
  },
}));

// Keep the parse fast + hermetic: stub the heavy collaborators so this test is
// strictly about permission/settings reading, not CLI discovery or profiles.
vi.mock("../models", () => ({ discoverModelsFromCli: () => [] }));
vi.mock("../profiles", () => ({
  listProfiles: () => [],
  getActiveProfileSlug: () => null,
}));
vi.mock("../credentials", () => ({ readCredentials: () => null }));

import { parseAccountData } from "../parser";

const GLOBAL_SETTINGS = path.join(tmp.root, "settings.json");

beforeEach(() => {
  // Reset global settings between tests; workspace files are written per test.
  try {
    fs.rmSync(GLOBAL_SETTINGS, { force: true });
  } catch {
    /* fresh */
  }
});

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), "utf-8");
}

describe("parseAccountData — permissions", () => {
  it("parses allow/deny for the global scope from settings.json", () => {
    writeJson(GLOBAL_SETTINGS, {
      permissions: {
        allow: ["Bash(git:*)", "Read", 42 /* non-string is dropped */],
        deny: ["Bash(rm:*)"],
        additionalDirectories: ["/tmp/extra", "/var/data"],
      },
    });

    const data = parseAccountData(undefined);
    const global = data.permissions.find((p) => p.scope === "global");
    expect(global).toBeTruthy();
    expect(global?.allow).toEqual(["Bash(git:*)", "Read"]);
    expect(global?.deny).toEqual(["Bash(rm:*)"]);
    // additionalDirectories is surfaced via settings, not the permission set.
    expect(data.settings.additionalDirectories).toEqual(["/tmp/extra", "/var/data"]);
  });

  it("reads project (settings.json) and local (settings.local.json) scopes from the workspace", () => {
    writeJson(GLOBAL_SETTINGS, { permissions: { allow: ["Read"], deny: [] } });

    const ws = fs.mkdtempSync(path.join(tmp.root, "ws-"));
    writeJson(path.join(ws, ".claude", "settings.json"), {
      permissions: { allow: ["Write", "Edit"], deny: ["WebFetch"] },
    });
    writeJson(path.join(ws, ".claude", "settings.local.json"), {
      permissions: { allow: ["Bash(*)"], deny: [] },
    });

    const data = parseAccountData(ws);
    const byScope = Object.fromEntries(data.permissions.map((p) => [p.scope, p]));

    expect(byScope.global.allow).toEqual(["Read"]);
    expect(byScope.project.allow).toEqual(["Write", "Edit"]);
    expect(byScope.project.deny).toEqual(["WebFetch"]);
    expect(byScope.local.allow).toEqual(["Bash(*)"]);
    // All three scopes present so the view shows Global/Project/Local segments.
    expect(data.permissions.map((p) => p.scope)).toEqual(["global", "project", "local"]);
  });

  it("yields empty allow/deny (not a missing scope) when a settings file is absent", () => {
    // No global settings.json on disk, workspace with no .claude files.
    const ws = fs.mkdtempSync(path.join(tmp.root, "ws-empty-"));
    const data = parseAccountData(ws);
    const byScope = Object.fromEntries(data.permissions.map((p) => [p.scope, p]));

    // Scope entries still exist (so the empty state, not a crash, renders) but
    // carry empty lists — the "No allowed tools" path in PermissionsView.
    expect(byScope.global).toEqual({ scope: "global", allow: [], deny: [] });
    expect(byScope.project).toEqual({ scope: "project", allow: [], deny: [] });
    expect(byScope.local).toEqual({ scope: "local", allow: [], deny: [] });
  });

  it("omits project/local scopes entirely when no workspace is open", () => {
    writeJson(GLOBAL_SETTINGS, { permissions: { allow: ["Read"], deny: [] } });
    const data = parseAccountData(undefined);
    expect(data.permissions.map((p) => p.scope)).toEqual(["global"]);
  });
});

describe("parseAccountData — settings keys", () => {
  it("treats Claude Code's default-ON keys as on when the file omits them", () => {
    // An absent key means stock behaviour, not "off". Reading it as off
    // would show every toggle unchecked on a clean install and invite the
    // user to "enable" things that were never disabled.
    writeJson(GLOBAL_SETTINGS, {});
    const s = parseAccountData().settings;
    expect(s.alwaysThinkingEnabled).toBe(true);
    expect(s.autoCompactEnabled).toBe(true);
    expect(s.fileCheckpointingEnabled).toBe(true);
    expect(s.autoMemoryEnabled).toBe(true);
    expect(s.includeGitInstructions).toBe(true);
    expect(s.spinnerTipsEnabled).toBe(true);
    // …and default-OFF keys stay off.
    expect(s.sandboxEnabled).toBe(false);
    expect(s.disableBypassPermissionsMode).toBe(false);
    expect(s.verbose).toBe(false);
    expect(s.autoCompactWindow).toBe(0);
  });

  it("reads an explicit false for each default-on key", () => {
    writeJson(GLOBAL_SETTINGS, {
      alwaysThinkingEnabled: false,
      autoCompactEnabled: false,
      fileCheckpointingEnabled: false,
      autoMemoryEnabled: false,
      includeGitInstructions: false,
    });
    const s = parseAccountData().settings;
    expect(s.alwaysThinkingEnabled).toBe(false);
    expect(s.autoCompactEnabled).toBe(false);
    expect(s.fileCheckpointingEnabled).toBe(false);
    expect(s.autoMemoryEnabled).toBe(false);
    expect(s.includeGitInstructions).toBe(false);
  });

  it("reads the nested sandbox and permission keys", () => {
    writeJson(GLOBAL_SETTINGS, {
      sandbox: { enabled: true },
      permissions: { disableBypassPermissionsMode: true, defaultMode: "auto" },
    });
    const s = parseAccountData().settings;
    expect(s.sandboxEnabled).toBe(true);
    expect(s.disableBypassPermissionsMode).toBe(true);
    expect(s.defaultMode).toBe("auto");
  });

  it("accepts every permission mode the CLI supports", () => {
    for (const mode of ["default", "acceptEdits", "auto", "plan", "dontAsk", "bypassPermissions"]) {
      writeJson(GLOBAL_SETTINGS, { permissions: { defaultMode: mode } });
      expect(parseAccountData().settings.defaultMode).toBe(mode);
    }
  });

  it("ignores a permission mode the CLI does not define", () => {
    writeJson(GLOBAL_SETTINGS, { permissions: { defaultMode: "yolo" } });
    expect(parseAccountData().settings.defaultMode).toBe("");
  });

  it("reads output style, editor mode, verbose and the compact window", () => {
    writeJson(GLOBAL_SETTINGS, {
      outputStyle: "Explanatory",
      editorMode: "vim",
      verbose: true,
      autoCompactWindow: 250_000,
    });
    const s = parseAccountData().settings;
    expect(s.outputStyle).toBe("Explanatory");
    expect(s.editorMode).toBe("vim");
    expect(s.verbose).toBe(true);
    expect(s.autoCompactWindow).toBe(250_000);
  });

  it("distinguishes an unset legacy co-author key from an explicit one", () => {
    // The view only warns about it when it is actually present AND false,
    // so "present" has to be tracked separately from the value.
    writeJson(GLOBAL_SETTINGS, {});
    expect(parseAccountData().settings.includeCoAuthoredBySet).toBe(false);

    writeJson(GLOBAL_SETTINGS, { includeCoAuthoredBy: false });
    const s = parseAccountData().settings;
    expect(s.includeCoAuthoredBySet).toBe(true);
    expect(s.includeCoAuthoredBy).toBe(false);
  });

  it("reads voice from either the current or the legacy key", () => {
    writeJson(GLOBAL_SETTINGS, { voice: { enabled: true } });
    expect(parseAccountData().settings.voiceEnabled).toBe(true);
    writeJson(GLOBAL_SETTINGS, { voiceEnabled: true });
    expect(parseAccountData().settings.voiceEnabled).toBe(true);
  });
});
