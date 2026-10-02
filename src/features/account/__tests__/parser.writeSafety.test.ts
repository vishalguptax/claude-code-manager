/**
 * ~/.claude.json restore and per-workspace snapshot routing through the
 * parser's public wrappers. HOME and CLAUDE_DIR are pinned to a temp dir
 * so nothing here touches the real ~/.claude.json.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const tmp = vi.hoisted(() => {
  const fsLocal = require("fs") as typeof import("fs");
  const osLocal = require("os") as typeof import("os");
  const pathLocal = require("path") as typeof import("path");
  const home = fsLocal.mkdtempSync(pathLocal.join(osLocal.tmpdir(), "cm-safety-"));
  return { home, claudeDir: pathLocal.join(home, ".claude") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => tmp.home };
});

vi.mock("../../../core/config", async (importOriginal) => ({
  // The real canonicaliser: snapshot buckets are keyed by it.
  canonicalPath: (await importOriginal<typeof import("../../../core/config")>()).canonicalPath,
  CLAUDE_DIR: tmp.claudeDir,
  CLAUDE_JSON_FILE: path.join(tmp.home, ".claude.json"),
  SETTINGS_FILE: path.join(tmp.claudeDir, "settings.json"),
  SETTINGS_SNAPSHOTS_DIR: path.join(tmp.claudeDir, "snapshots"),
  claudeSettingsPath: (scope: string, workspacePath?: string) => {
    if (scope === "global") return path.join(tmp.claudeDir, "settings.json");
    if (!workspacePath) return null;
    const name = scope === "local" ? "settings.local.json" : "settings.json";
    return path.join(workspacePath, ".claude", name);
  },
}));

vi.mock("../models", () => ({ discoverModelsFromCli: () => [] }));
vi.mock("../profiles", () => ({ listProfiles: () => [], getActiveProfileSlug: () => null }));
vi.mock("../credentials", () => ({ readCredentials: () => null }));

import {
  addPermissionEntry,
  deleteSettingsSnapshot,
  listAllSnapshots,
  restoreClaudeJsonFromBackup,
  restoreSettingsSnapshot,
} from "../parser";

const CLAUDE_JSON = path.join(tmp.home, ".claude.json");
const BACKUPS = path.join(tmp.claudeDir, "backups");

beforeEach(() => {
  for (const name of fs.readdirSync(tmp.home)) {
    fs.rmSync(path.join(tmp.home, name), { recursive: true, force: true });
  }
  fs.mkdirSync(BACKUPS, { recursive: true });
});

describe("restoreClaudeJsonFromBackup", () => {
  const backup = (ts: number, body: string): void =>
    fs.writeFileSync(path.join(BACKUPS, `.claude.json.backup.${ts}`), body);

  it("restores the newest valid backup over an empty live file", () => {
    fs.writeFileSync(CLAUDE_JSON, "");
    backup(100, '{"v":"old"}');
    backup(200, '{"v":"newest"}');
    backup(300, "{ truncated");
    expect(restoreClaudeJsonFromBackup()).toEqual({
      status: "restored",
      backupPath: path.join(BACKUPS, ".claude.json.backup.200"),
    });
    expect(fs.readFileSync(CLAUDE_JSON, "utf-8")).toBe('{"v":"newest"}');
  });

  it("leaves a live file that is valid again untouched", () => {
    // The banner came from a read that caught the CLI mid-write; the
    // file is whole now and newer than any backup.
    fs.writeFileSync(CLAUDE_JSON, '{"v":"live-and-newer"}');
    backup(100, '{"v":"old"}');
    expect(restoreClaudeJsonFromBackup()).toEqual({ status: "healthy" });
    expect(fs.readFileSync(CLAUDE_JSON, "utf-8")).toBe('{"v":"live-and-newer"}');
  });

  it("restores when the live file is missing or not an object", () => {
    backup(100, '{"v":"old"}');
    expect(restoreClaudeJsonFromBackup().status).toBe("restored");
    fs.writeFileSync(CLAUDE_JSON, "[]");
    expect(restoreClaudeJsonFromBackup().status).toBe("restored");
  });

  it("reports no-backup when none parses", () => {
    fs.writeFileSync(CLAUDE_JSON, "{");
    backup(100, "");
    expect(restoreClaudeJsonFromBackup()).toEqual({ status: "no-backup" });
    expect(fs.readFileSync(CLAUDE_JSON, "utf-8")).toBe("{");
  });
});

describe("settings snapshots route by workspace", () => {
  const wsA = (): string => path.join(tmp.home, "ws-a");
  const wsB = (): string => path.join(tmp.home, "ws-b");
  const projectFile = (ws: string): string => path.join(ws, ".claude", "settings.json");

  function seedProject(ws: string, who: string): void {
    fs.mkdirSync(path.dirname(projectFile(ws)), { recursive: true });
    fs.writeFileSync(projectFile(ws), JSON.stringify({ who, permissions: { allow: [] } }));
  }

  it("lists only the open workspace's project snapshots, plus global", () => {
    seedProject(wsA(), "a");
    seedProject(wsB(), "b");
    addPermissionEntry("project", "Read", "allow", wsA());
    addPermissionEntry("project", "Edit", "allow", wsB());
    addPermissionEntry("project", "Glob", "allow", wsB());
    expect(listAllSnapshots(wsA()).filter((s) => s.scope === "project")).toHaveLength(1);
    expect(listAllSnapshots(wsB()).filter((s) => s.scope === "project")).toHaveLength(2);
  });

  it("never restores project A's snapshot into project B", () => {
    seedProject(wsA(), "a");
    seedProject(wsB(), "b");
    addPermissionEntry("project", "Read", "allow", wsA());
    const [snapA] = listAllSnapshots(wsA()).filter((s) => s.scope === "project");
    const bBefore = fs.readFileSync(projectFile(wsB()), "utf-8");
    expect(restoreSettingsSnapshot("project", snapA.id, wsB())).toBe(false);
    expect(fs.readFileSync(projectFile(wsB()), "utf-8")).toBe(bBefore);

    expect(restoreSettingsSnapshot("project", snapA.id, wsA())).toBe(true);
    expect(JSON.parse(fs.readFileSync(projectFile(wsA()), "utf-8"))).toEqual({
      who: "a",
      permissions: { allow: [] },
    });
  });

  it("deletes a project snapshot by id alone", () => {
    seedProject(wsA(), "a");
    addPermissionEntry("project", "Read", "allow", wsA());
    const [snap] = listAllSnapshots(wsA());
    expect(deleteSettingsSnapshot("project", snap.id)).toBe(true);
    expect(listAllSnapshots(wsA())).toEqual([]);
  });
});
