import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  composeTiers,
  managedPlistPaths,
  managedSettingsDir,
  managedSettingsPath,
  mergeManagedLayer,
  parseRegQuery,
  type PolicySourceRead,
  clearOsPolicyCache,
  HKCU_POLICY_KEY,
  type PolicyToolRunner,
  readMacPlist,
  readManagedSettings,
  readWindowsRegistry,
} from "../managedSettings";

const ROOT = path.join(os.tmpdir(), "claude-manager-managed-settings-test");
const POLICY_DIR = path.join(ROOT, "ClaudeCode");
const DROP_INS = path.join(POLICY_DIR, "managed-settings.d");
const REMOTE = path.join(ROOT, "home", ".claude", "remote-settings.json");

function write(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

const NO_MDM = (): PolicySourceRead => ({ settings: null, source: "", errors: [] });

/** Read the tier from the temp tree, with a given (default: absent) mdm source. */
function read(readMdm: () => PolicySourceRead = NO_MDM, readHkcu: () => PolicySourceRead = NO_MDM) {
  return readManagedSettings({ dir: POLICY_DIR, remoteFile: REMOTE, readMdm, readHkcu });
}

beforeEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));
afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe("managedSettingsDir / managedSettingsPath", () => {
  it("resolves the platform policy directory Claude Code reads", () => {
    expect(managedSettingsDir("darwin")).toBe("/Library/Application Support/ClaudeCode");
    expect(managedSettingsDir("linux")).toBe("/etc/claude-code");
    expect(managedSettingsDir("win32")).toBe("C:\\Program Files\\ClaudeCode");
    expect(managedSettingsPath("linux")).toBe("/etc/claude-code/managed-settings.json");
  });
});

describe("mergeManagedLayer", () => {
  it("deep-merges objects, lets a later scalar win, and unions arrays", () => {
    const merged = mergeManagedLayer(
      {
        permissions: { deny: ["Bash(curl:*)"], defaultMode: "default" },
        blockedMarketplaces: ["a"],
        syncClaudeAiSkills: true,
      },
      {
        permissions: { deny: ["Bash(curl:*)", "WebFetch"] },
        blockedMarketplaces: ["b"],
        syncClaudeAiSkills: false,
      },
    );
    expect(merged).toEqual({
      permissions: { deny: ["Bash(curl:*)", "WebFetch"], defaultMode: "default" },
      blockedMarketplaces: ["a", "b"],
      syncClaudeAiSkills: false,
    });
  });

  it("merges extraKnownMarketplaces one level deep — a later entry replaces, not merges", () => {
    const merged = mergeManagedLayer(
      { extraKnownMarketplaces: { corp: { source: { source: "github", repo: "corp/old" } } } },
      { extraKnownMarketplaces: { corp: { source: { source: "git", url: "https://x" } } } },
    );
    expect(merged.extraKnownMarketplaces).toEqual({
      corp: { source: { source: "git", url: "https://x" } },
    });
  });
});

describe("readManagedSettings", () => {
  it("reports no policy when no source exists, naming managed-settings.json", () => {
    expect(read()).toEqual({
      settings: null,
      source: path.join(POLICY_DIR, "managed-settings.json"),
      errors: [],
    });
  });

  it("merges managed-settings.json then the drop-ins in sorted order (later wins)", () => {
    write(path.join(POLICY_DIR, "managed-settings.json"), {
      syncClaudeAiPlugins: true,
      blockedMarketplaces: ["base-mkt"],
    });
    // Written out of order on purpose: precedence is the sort, not the mtime.
    write(path.join(DROP_INS, "20-security.json"), { syncClaudeAiPlugins: false });
    write(path.join(DROP_INS, "10-plugins.json"), {
      syncClaudeAiPlugins: true,
      blockedMarketplaces: ["rogue-mkt"],
    });
    // Skipped like the CLI skips them: a dotfile and a non-.json file.
    write(path.join(DROP_INS, ".99-hidden.json"), { syncClaudeAiPlugins: true });
    write(path.join(DROP_INS, "99-notes.txt"), "syncClaudeAiPlugins: true");

    const res = read();
    expect(res.settings).toEqual({
      syncClaudeAiPlugins: false,
      blockedMarketplaces: ["base-mkt", "rogue-mkt"],
    });
    expect(res.errors).toEqual([]);
  });

  it("sorts drop-ins by code unit, so an uppercase name sorts before a lowercase one", () => {
    write(path.join(DROP_INS, "a.json"), { cleanupPeriodDays: 1 });
    write(path.join(DROP_INS, "B.json"), { cleanupPeriodDays: 2 });
    // "B" (0x42) < "a" (0x61): a.json is applied last and wins.
    expect(read().settings).toEqual({ cleanupPeriodDays: 1 });
  });

  it("applies drop-ins even when managed-settings.json is absent", () => {
    write(path.join(DROP_INS, "50-sync.json"), { syncClaudeAiSkills: false });
    expect(read().settings).toEqual({ syncClaudeAiSkills: false });
  });

  it("skips an unparseable drop-in and reports it, keeping the others", () => {
    write(path.join(DROP_INS, "10-ok.json"), { syncClaudeAiSkills: false });
    write(path.join(DROP_INS, "20-bad.json"), '{"syncClaudeAiSkills": true,');
    const res = read();
    expect(res.settings).toEqual({ syncClaudeAiSkills: false });
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("20-bad.json");
  });

  it("lets server-managed settings supply the whole tier, ignoring the file tier", () => {
    write(path.join(POLICY_DIR, "managed-settings.json"), { blockedMarketplaces: ["file-mkt"] });
    write(REMOTE, { $schema: "x", $etag: "abc", syncClaudeAiPlugins: false });
    expect(read()).toEqual({
      settings: { syncClaudeAiPlugins: false },
      source: REMOTE,
      errors: [],
    });
  });

  it("falls back to the file tier when remote-settings.json holds only metadata", () => {
    write(REMOTE, { $schema: "x" });
    write(path.join(POLICY_DIR, "managed-settings.json"), { blockedMarketplaces: ["file-mkt"] });
    const res = read();
    expect(res.settings).toEqual({ blockedMarketplaces: ["file-mkt"] });
    expect(res.source).toBe(path.join(POLICY_DIR, "managed-settings.json"));
  });
});

describe("readManagedSettings — drop-in symlinks", () => {
  it("follows a symlinked drop-in, as the CLI does, but still skips a dot-named one", () => {
    const target = path.join(ROOT, "shared", "policy.json");
    write(target, { syncClaudeAiPlugins: false });
    fs.mkdirSync(DROP_INS, { recursive: true });
    fs.symlinkSync(target, path.join(DROP_INS, "50-shared.json"));
    fs.symlinkSync(target, path.join(DROP_INS, ".60-hidden.json"));
    expect(read().settings).toEqual({ syncClaudeAiPlugins: false });
    expect(read().errors).toEqual([]);
  });
});

describe("readManagedSettings — source precedence", () => {
  const plist = (settings: Record<string, unknown>) => (): PolicySourceRead => ({
    settings,
    source: "/Library/Managed Preferences/com.anthropic.claudecode.plist",
    errors: [],
  });

  it("lets the mdm source outrank the file tier", () => {
    write(path.join(POLICY_DIR, "managed-settings.json"), { syncClaudeAiSkills: true });
    expect(read(plist({ syncClaudeAiSkills: false }))).toMatchObject({
      settings: { syncClaudeAiSkills: false },
      source: "/Library/Managed Preferences/com.anthropic.claudecode.plist",
    });
  });

  it("lets server-managed settings outrank the mdm source", () => {
    write(REMOTE, { blockedMarketplaces: ["remote-mkt"] });
    expect(read(plist({ blockedMarketplaces: ["mdm-mkt"] })).settings).toEqual({
      blockedMarketplaces: ["remote-mkt"],
    });
  });

  it("merges the lower sources beneath a winner that asks for it", () => {
    write(REMOTE, { managedSourcesBehavior: "merge", blockedMarketplaces: ["remote-mkt"] });
    write(path.join(POLICY_DIR, "managed-settings.json"), {
      blockedMarketplaces: ["file-mkt"],
      syncClaudeAiPlugins: false,
    });
    expect(read(plist({ strictKnownMarketplaces: ["corp"] })).settings).toEqual({
      blockedMarketplaces: ["file-mkt", "remote-mkt"],
      strictKnownMarketplaces: ["corp"],
      syncClaudeAiPlugins: false,
    });
  });
});

describe("composeTiers", () => {
  it("returns the winner alone, minus managedSourcesBehavior, without merge", () => {
    expect(composeTiers([{ a: 1, managedSourcesBehavior: "first-wins" }, { b: 2 }])).toEqual({ a: 1 });
    expect(composeTiers([])).toBeNull();
  });

  it("under merge: the winner decides top-only keys and replaces allowlists", () => {
    const merged = composeTiers([
      { managedSourcesBehavior: "merge", strictKnownMarketplaces: ["corp"] },
      {
        permissions: { defaultMode: "bypassPermissions", deny: ["WebFetch"] },
        strictKnownMarketplaces: ["anything"],
      },
    ]);
    expect(merged).toEqual({ permissions: { deny: ["WebFetch"] }, strictKnownMarketplaces: ["corp"] });
  });

  it("under merge: a false sync opt-out from any source survives a winner's true", () => {
    expect(
      composeTiers([
        { managedSourcesBehavior: "merge", syncClaudeAiSkills: true },
        { syncClaudeAiSkills: false },
      ]),
    ).toEqual({ syncClaudeAiSkills: false });
  });
});

describe("readMacPlist", () => {
  const runner = (out: Record<string, string>): PolicyToolRunner => (_file, args) => {
    const stdout = out[args[args.length - 1]];
    return stdout === undefined ? { ok: false, reason: "exit 1" } : { ok: true, stdout };
  };

  it("lists the per-user plist before the device-level one", () => {
    expect(managedPlistPaths("dev")).toEqual([
      "/Library/Managed Preferences/dev/com.anthropic.claudecode.plist",
      "/Library/Managed Preferences/com.anthropic.claudecode.plist",
    ]);
    expect(managedPlistPaths("")).toEqual([
      "/Library/Managed Preferences/com.anthropic.claudecode.plist",
    ]);
  });

  it("takes the first readable plist that holds settings, converted by plutil", () => {
    const user = path.join(ROOT, "user.plist");
    const device = path.join(ROOT, "device.plist");
    write(user, "<plist/>");
    write(device, "<plist/>");
    const calls: string[][] = [];
    const run: PolicyToolRunner = (file, args) => {
      calls.push([file, ...args]);
      return runner({ [user]: "{}", [device]: '{"syncClaudeAiPlugins":false}' })(file, args);
    };
    expect(readMacPlist([user, device], run)).toEqual({
      settings: { syncClaudeAiPlugins: false },
      source: device,
      errors: [],
    });
    expect(calls[0]).toEqual(["/usr/bin/plutil", "-convert", "json", "-o", "-", "--", user]);
  });

  it("skips a missing plist silently and reports one plutil cannot convert", () => {
    const bad = path.join(ROOT, "bad.plist");
    write(bad, "<plist/>");
    const res = readMacPlist([path.join(ROOT, "missing.plist"), bad], runner({}));
    expect(res.settings).toBeNull();
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("bad.plist");
  });
});

describe("readWindowsRegistry", () => {
  const REG_OUTPUT = [
    "",
    "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\ClaudeCode",
    '    Settings    REG_SZ    {"syncClaudeAiSkills":false}',
    "",
  ].join("\r\n");

  it("parses the Settings value out of reg query output", () => {
    expect(parseRegQuery(REG_OUTPUT)).toBe('{"syncClaudeAiSkills":false}');
    expect(parseRegQuery("ERROR: The system was unable to find the specified registry key")).toBeNull();
  });

  it("queries HKLM by argv and reads the JSON value", () => {
    let argv: string[] = [];
    const res = readWindowsRegistry(undefined, (file, args) => {
      argv = [path.basename(file), ...args];
      return { ok: true, stdout: REG_OUTPUT };
    });
    expect(argv).toEqual(["reg.exe", "query", "HKLM\\SOFTWARE\\Policies\\ClaudeCode", "/v", "Settings"]);
    expect(res.settings).toEqual({ syncClaudeAiSkills: false });
  });

  it("fails closed to absent when reg.exe fails or times out", () => {
    expect(readWindowsRegistry(undefined, () => ({ ok: false, reason: "ETIMEDOUT" }))).toMatchObject({
      settings: null,
      errors: [],
    });
  });
});

describe("readManagedSettings — HKCU tier", () => {
  const hkcu = (settings: Record<string, unknown>) => (): PolicySourceRead => ({
    settings,
    source: `Registry: ${HKCU_POLICY_KEY}\\Settings`,
    errors: [],
  });

  it("applies the user-writable HKCU value when no admin source holds anything", () => {
    expect(read(NO_MDM, hkcu({ syncClaudeAiSkills: false }))).toMatchObject({
      settings: { syncClaudeAiSkills: false },
      source: `Registry: ${HKCU_POLICY_KEY}\\Settings`,
    });
  });

  it("ranks HKCU below the file tier and never merges it in", () => {
    write(path.join(POLICY_DIR, "managed-settings.json"), {
      managedSourcesBehavior: "merge",
      blockedMarketplaces: ["file-mkt"],
    });
    expect(read(NO_MDM, hkcu({ blockedMarketplaces: ["user-mkt"], syncClaudeAiSkills: false })).settings).toEqual({
      blockedMarketplaces: ["file-mkt"],
    });
  });

  it("queries the HKCU key with the same argv-only reg query", () => {
    let argv: string[] = [];
    readWindowsRegistry(HKCU_POLICY_KEY, (_file, args) => {
      argv = args;
      return { ok: false, reason: "not found" };
    });
    expect(argv).toEqual(["query", HKCU_POLICY_KEY, "/v", "Settings"]);
  });
});

describe("OS policy cache", () => {
  it("reads the OS sources once and again only after clearOsPolicyCache", async () => {
    // Re-import with a stubbed child_process to count spawns of the real readers.
    vi.resetModules();
    const spawned: string[] = [];
    vi.doMock("child_process", () => ({
      execFileSync: (file: string) => {
        spawned.push(file);
        throw new Error("no policy");
      },
    }));
    const platform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const mod = await import("../managedSettings");
      mod.readManagedSettings({ dir: POLICY_DIR, remoteFile: REMOTE });
      mod.readManagedSettings({ dir: POLICY_DIR, remoteFile: REMOTE });
      expect(spawned).toHaveLength(2); // HKLM + HKCU, once
      mod.clearOsPolicyCache();
      mod.readManagedSettings({ dir: POLICY_DIR, remoteFile: REMOTE });
      expect(spawned).toHaveLength(4);
    } finally {
      Object.defineProperty(process, "platform", { value: platform });
      vi.doUnmock("child_process");
      vi.resetModules();
    }
  });

  it("clearOsPolicyCache is safe to call before any read", () => {
    expect(() => clearOsPolicyCache()).not.toThrow();
  });
});
