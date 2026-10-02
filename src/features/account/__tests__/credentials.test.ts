import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Tests for the credentials I/O abstraction.
 *
 * The file backend is exercised against a real temp directory because
 * `fs.writeFileSync` + `fs.statSync` + tmp+rename behaviour is the
 * actual contract callers depend on — mocking it would just re-test
 * the mock.
 *
 * The macOS Keychain backend is exercised by mocking `child_process`
 * `execFileSync`. We assert on the argv the production code passes,
 * which is the only stable surface a real Keychain would observe.
 */

// Hoist temp paths so vi.mock factories can reach them.
const { CLAUDE_DIR_TMP, CREDENTIALS_PATH } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  const homeTmp = _path.join(_os.tmpdir(), ".claude-test-credentials-home");
  const claudeDir = _path.join(homeTmp, ".claude");
  return {
    CLAUDE_DIR_TMP: claudeDir,
    CREDENTIALS_PATH: _path.join(claudeDir, ".credentials.json"),
  };
});

/** The config environment the next fresh import of the module sees. */
const configEnv = vi.hoisted(() => ({ env: {} as Record<string, string> }));

vi.mock("../../../core/config", () => ({
  get CLAUDE_ENV() {
    return configEnv.env;
  },
  CLAUDE_DIR: CLAUDE_DIR_TMP,
  SECURE_STORAGE_DIR: CLAUDE_DIR_TMP,
  PROJECTS_DIR: path.join(CLAUDE_DIR_TMP, "projects"),
  HISTORY_FILE: path.join(CLAUDE_DIR_TMP, "history.jsonl"),
  SESSIONS_DIR: path.join(CLAUDE_DIR_TMP, "sessions"),
  STATE_FILE: path.join(CLAUDE_DIR_TMP, ".csm-state.json"),
  SESSION_META_READ_BYTES: 4096,
  STATS_CACHE_FILE: path.join(CLAUDE_DIR_TMP, "stats-cache.json"),
  SETTINGS_SNAPSHOTS_DIR: path.join(CLAUDE_DIR_TMP, ".claude-manager-snapshots"),
}));

// child_process is mocked per test so each backend test can drive its
// own execFileSync response. Default is "throw with status 44" — i.e.
// "no item in Keychain" — so non-keychain tests don't accidentally
// fall through to a Keychain hit.
const execFileMock = vi.fn();
vi.mock("child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileMock(...args),
}));

// Default execFile behaviour: emulate `security` returning exit 44.
function makeStatusError(status: number): Error & { status: number } {
  const err = new Error(`exit ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

beforeEach(() => {
  execFileMock.mockReset();
  // Default: not found.
  execFileMock.mockImplementation(() => {
    throw makeStatusError(44);
  });
  fs.rmSync(CLAUDE_DIR_TMP, { recursive: true, force: true });
  fs.mkdirSync(CLAUDE_DIR_TMP, { recursive: true });
});

afterEach(() => {
  fs.rmSync(CLAUDE_DIR_TMP, { recursive: true, force: true });
});

/**
 * The module under test, imported fresh for every test. It keeps a short
 * Keychain read cache and remembers which Keychain bytes it has seen; a
 * fresh instance means no test's mock responses are masked by another's,
 * without the module exporting a reset hook for tests.
 */
let C: typeof import("../credentials");
beforeEach(async () => {
  vi.resetModules();
  C = await import("../credentials");
});

/**
 * Claude Code's Keychain service names and the binary it shells out to —
 * the contract a real Keychain observes, so the tests pin the literals
 * rather than reading them back from the module under test.
 */
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const KEYCHAIN_LEGACY_SERVICE = "Claude Code";
const SECURITY_BIN = "/usr/bin/security";

const SAMPLE_RAW = JSON.stringify({
  claudeAiOauth: {
    accessToken: "tok-abc",
    refreshToken: "ref-xyz",
    expiresAt: 1800000000000,
    subscriptionType: "max",
  },
});

describe("hashCredentials", () => {
  it("is stable for identical bytes", () => {
    const a = C.hashCredentials(SAMPLE_RAW);
    const b = C.hashCredentials(SAMPLE_RAW);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("differs for different bytes", () => {
    expect(C.hashCredentials(SAMPLE_RAW)).not.toBe(C.hashCredentials(SAMPLE_RAW + " "));
  });
});

describe("readCredentials — file backend", () => {
  it("returns null when no file exists and Keychain has no item", () => {
    expect(C.readCredentials()).toBeNull();
  });

  it("returns parsed blob + file source when the file is present", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const live = C.readCredentials();
    expect(live).not.toBeNull();
    expect(live!.source.kind).toBe("file");
    expect(live!.source.locator).toBe(C.CREDENTIALS_FILE);
    expect(live!.blob.claudeAiOauth?.accessToken).toBe("tok-abc");
    expect(live!.raw).toBe(SAMPLE_RAW);
    expect(live!.hash).toBe(C.hashCredentials(SAMPLE_RAW));
  });

  it("ignores an empty file", () => {
    fs.writeFileSync(CREDENTIALS_PATH, "");
    expect(C.readCredentials()).toBeNull();
  });

  it("ignores a file with invalid JSON", () => {
    fs.writeFileSync(CREDENTIALS_PATH, "{not-json");
    expect(C.readCredentials()).toBeNull();
  });

  it("ignores a file missing the claudeAiOauth.accessToken field", () => {
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ claudeAiOauth: {} }));
    expect(C.readCredentials()).toBeNull();
  });
});

describe("readCredentials — macOS Keychain backend", () => {
  const originalPlatform = process.platform;

  function pretendDarwin(): void {
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });
  }
  function restorePlatform(): void {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  }

  afterEach(restorePlatform);

  it("reads from `Claude Code-credentials` on macOS when file is absent", () => {
    pretendDarwin();
    execFileMock.mockImplementation((bin: string, args: string[]) => {
      expect(bin).toBe(SECURITY_BIN);
      expect(args[0]).toBe("find-generic-password");
      expect(args).toContain("-s");
      expect(args).toContain(KEYCHAIN_SERVICE);
      return SAMPLE_RAW + "\n"; // trailing newline emulates `security` behaviour
    });
    const live = C.readCredentials();
    expect(live).not.toBeNull();
    expect(live!.source.kind).toBe("keychain-darwin");
    expect(live!.source.locator).toBe(KEYCHAIN_SERVICE);
    expect(live!.blob.claudeAiOauth?.accessToken).toBe("tok-abc");
  });

  it("falls back to the legacy `Claude Code` service name when the current one is absent", () => {
    pretendDarwin();
    let callCount = 0;
    execFileMock.mockImplementation((_bin: string, args: string[]) => {
      callCount++;
      const serviceArg = args[args.indexOf("-s") + 1];
      if (serviceArg === KEYCHAIN_SERVICE) {
        throw makeStatusError(44);
      }
      if (serviceArg === KEYCHAIN_LEGACY_SERVICE) {
        return SAMPLE_RAW;
      }
      throw makeStatusError(44);
    });
    const live = C.readCredentials();
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(live).not.toBeNull();
    expect(live!.source.locator).toBe(KEYCHAIN_LEGACY_SERVICE);
  });

  it("returns null on non-darwin even when the mock would have responded", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    // Default platform — not darwin. The Keychain backend should not
    // be invoked at all (no `security` calls).
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    expect(C.readCredentials()).toBeNull();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("prefers the Keychain over a leftover file (Claude Code 2.1.287 precedence)", () => {
    pretendDarwin();
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    execFileMock.mockImplementation(() =>
      JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token" } }),
    );
    const live = C.readCredentials();
    expect(live!.source.kind).toBe("keychain-darwin");
    expect(live!.blob.claudeAiOauth?.accessToken).toBe("keychain-token");
  });

  it("uses the file on macOS when the Keychain has no item", () => {
    pretendDarwin();
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const live = C.readCredentials();
    expect(live!.source.kind).toBe("file");
    expect(live!.blob.claudeAiOauth?.accessToken).toBe("tok-abc");
  });

  it.each([25, 51, 36])(
    "for display, falls back to the file when the Keychain fails transiently (exit %i)",
    (code) => {
      // Mirrors the CLI's keychain-then-plaintext read, so SSH and
      // locked-Keychain users still see their account.
      pretendDarwin();
      fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
      execFileMock.mockImplementation(() => {
        throw makeStatusError(code);
      });
      expect(C.readCredentials()!.source.kind).toBe("file");
    },
  );
});

describe("probeKeychainStatus", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("returns 'unsupported' on non-darwin platforms", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    expect(C.probeKeychainStatus()).toBe("unsupported");
  });

  it("maps exit 51 → denied", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(51);
    });
    expect(C.probeKeychainStatus()).toBe("denied");
  });

  it("maps exit 25 → locked", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(25);
    });
    expect(C.probeKeychainStatus()).toBe("locked");
  });

  it("maps exit 36 → unreachable (SSH / headless)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(36);
    });
    expect(C.probeKeychainStatus()).toBe("unreachable");
  });

  it("returns 'absent' only when BOTH service names report absent", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(44);
    });
    expect(C.probeKeychainStatus()).toBe("absent");
  });

  it("returns 'ok' when the current service name has an item", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    expect(C.probeKeychainStatus()).toBe("ok");
  });
});

describe("isLoggedOut", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("true when no file exists on a non-darwin platform", () => {
    expect(C.isLoggedOut()).toBe(true);
  });

  it("false when the file is present (non-darwin)", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    expect(C.isLoggedOut()).toBe(false);
  });

  it("true on macOS when both file absent AND Keychain item absent", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(44);
    });
    expect(C.isLoggedOut()).toBe(true);
  });

  it("false on macOS when Keychain has the item", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    expect(C.isLoggedOut()).toBe(false);
  });

  it("false on macOS when Keychain is locked (cannot confirm absent)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(25);
    });
    expect(C.isLoggedOut()).toBe(false);
  });
});

describe("writeCredentials — file backend", () => {
  it("writes bytes verbatim", () => {
    const ok = C.writeCredentials(SAMPLE_RAW, {
      kind: "file",
      locator: C.CREDENTIALS_FILE,
    });
    expect(ok).toBe(true);
    expect(fs.readFileSync(CREDENTIALS_PATH, "utf-8")).toBe(SAMPLE_RAW);
  });

  it("creates the .claude directory if missing", () => {
    fs.rmSync(CLAUDE_DIR_TMP, { recursive: true, force: true });
    const ok = C.writeCredentials(SAMPLE_RAW, {
      kind: "file",
      locator: C.CREDENTIALS_FILE,
    });
    expect(ok).toBe(true);
    expect(fs.existsSync(CREDENTIALS_PATH)).toBe(true);
  });

  it("does not leave a `.tmp` straggler after success", () => {
    C.writeCredentials(SAMPLE_RAW, { kind: "file", locator: C.CREDENTIALS_FILE });
    expect(fs.existsSync(CREDENTIALS_PATH + ".tmp")).toBe(false);
  });
});

describe("writeCredentials — macOS Keychain backend", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("invokes `security add-generic-password -U` with the configured service + raw payload", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    let captured: { bin?: string; args?: string[] } = {};
    execFileMock.mockImplementation((bin: string, args: string[]) => {
      captured = { bin, args };
      return "";
    });
    const ok = C.writeCredentials(SAMPLE_RAW, {
      kind: "keychain-darwin",
      locator: KEYCHAIN_SERVICE,
    });
    expect(ok).toBe(true);
    expect(captured.bin).toBe(SECURITY_BIN);
    expect(captured.args).toContain("add-generic-password");
    expect(captured.args).toContain("-U");
    expect(captured.args).toContain(KEYCHAIN_SERVICE);
    // The raw blob is passed as the `-w` value.
    const wIdx = captured.args!.indexOf("-w");
    expect(captured.args![wIdx + 1]).toBe(SAMPLE_RAW);
  });

  it("returns false on macOS when `security` exits non-zero", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(1);
    });
    const ok = C.writeCredentials(SAMPLE_RAW, {
      kind: "keychain-darwin",
      locator: KEYCHAIN_SERVICE,
    });
    expect(ok).toBe(false);
  });

  it("refuses to write to keychain-darwin on non-darwin platforms", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const ok = C.writeCredentials(SAMPLE_RAW, {
      kind: "keychain-darwin",
      locator: KEYCHAIN_SERVICE,
    });
    expect(ok).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("deleteCredentials", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("removes the file backend", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    expect(
      C.deleteCredentials({ kind: "file", locator: C.CREDENTIALS_FILE }),
    ).toBe(true);
    expect(fs.existsSync(CREDENTIALS_PATH)).toBe(false);
  });

  it("treats an absent file as already gone (idempotent)", () => {
    expect(
      C.deleteCredentials({ kind: "file", locator: C.CREDENTIALS_FILE }),
    ).toBe(true);
  });

  it("invokes `security delete-generic-password` on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    let args: string[] = [];
    execFileMock.mockImplementation((_bin: string, a: string[]) => {
      args = a;
      return "";
    });
    expect(
      C.deleteCredentials({
        kind: "keychain-darwin",
        locator: KEYCHAIN_SERVICE,
      }),
    ).toBe(true);
    expect(args[0]).toBe("delete-generic-password");
    expect(args).toContain(KEYCHAIN_SERVICE);
  });

  it("treats exit 44 from `security delete` as success (already gone)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(44);
    });
    expect(
      C.deleteCredentials({
        kind: "keychain-darwin",
        locator: KEYCHAIN_SERVICE,
      }),
    ).toBe(true);
  });
});

describe("defaultTargetSource", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("targets the file on non-darwin platforms", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const target = C.defaultTargetSource();
    expect(target.kind).toBe("file");
  });

  it("targets the Keychain on darwin when the file is absent", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const target = C.defaultTargetSource();
    expect(target.kind).toBe("keychain-darwin");
    expect(target.locator).toBe(KEYCHAIN_SERVICE);
  });

  it("targets the Keychain on darwin even when a leftover file exists", () => {
    // The CLI reads the Keychain first; a file written here would be
    // shadowed by any Keychain item it finds.
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    expect(C.defaultTargetSource().kind).toBe("keychain-darwin");
  });
});

describe("detectSource", () => {
  it("returns the source of the live read or null", () => {
    expect(C.detectSource()).toBeNull();
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    expect(C.detectSource()?.kind).toBe("file");
  });
});

describe("readCredentialsRaceSafe", () => {
  it("returns the read when the hash is stable across two reads", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const live = C.readCredentialsRaceSafe();
    expect(live).not.toBeNull();
    expect(live!.hash).toBe(C.hashCredentials(SAMPLE_RAW));
  });

  it("returns null when no source has data", () => {
    expect(C.readCredentialsRaceSafe()).toBeNull();
  });
});

describe("keychain read cache", () => {
  it("serves repeated reads within the TTL from one security spawn", () => {
    if (process.platform !== "darwin") return;
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    C.readCredentials();
    const spawnsAfterFirst = execFileMock.mock.calls.length;
    C.readCredentials();
    C.readCredentials();
    expect(execFileMock.mock.calls.length).toBe(spawnsAfterFirst);
  });

  it("invalidates on write so the next read sees fresh state", () => {
    if (process.platform !== "darwin") return;
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    C.readCredentials();
    C.writeCredentials(SAMPLE_RAW, {
      kind: "keychain-darwin",
      locator: KEYCHAIN_SERVICE,
    });
    const spawnsAfterWrite = execFileMock.mock.calls.length;
    C.readCredentials();
    expect(execFileMock.mock.calls.length).toBeGreaterThan(spawnsAfterWrite);
  });
});

describe("readCredentialsStatus — precedence", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("returns the Keychain item over a leftover file on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    execFileMock.mockImplementation(() =>
      JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token" } }),
    );
    const status = C.readCredentialsStatus();
    expect(status.state === "ok" && status.live.source.kind).toBe("keychain-darwin");
  });

  it("reports transient, not missing, for a locked Keychain with no file", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(25);
    });
    expect(C.readCredentialsStatus().state).toBe("transient");
  });

  it("reports a truncated file as transient when the Keychain has nothing", () => {
    fs.writeFileSync(CREDENTIALS_PATH, "{\"claudeAiOauth\":");
    expect(C.readCredentialsStatus().state).toBe("transient");
  });
});

describe("readCredentialsForWrite", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it.each([25, 51, 36])(
    "reports keychain-unavailable instead of a leftover file (exit %i)",
    (code) => {
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
      fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
      execFileMock.mockImplementation(() => {
        throw makeStatusError(code);
      });
      expect(C.readCredentialsForWrite().state).toBe("keychain-unavailable");
    },
  );

  it("uses the file when the Keychain has no item", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const status = C.readCredentialsForWrite();
    expect(status.state === "ok" && status.live.source.kind).toBe("file");
  });

  it("uses the file on other platforms", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    expect(C.readCredentialsForWrite().state).toBe("ok");
  });
});

describe("readCredentialsForWrite — cache", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("re-reads the Keychain instead of serving the cached value", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    C.readCredentials();
    const rotated = JSON.stringify({ claudeAiOauth: { accessToken: "rotated" } });
    execFileMock.mockImplementation(() => rotated);
    // Within the TTL a plain read is still the cached one…
    expect(C.readCredentials()!.blob.claudeAiOauth?.accessToken).toBe("tok-abc");
    // …a fresh read sees the refresh.
    const fresh = C.readCredentialsForWrite();
    expect(fresh.state === "ok" && fresh.live.blob.claudeAiOauth?.accessToken).toBe("rotated");
  });
});

describe("credentialsChangedAt", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("is the file's mtime for the file backend", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const when = new Date(1_700_000_000_000);
    fs.utimesSync(CREDENTIALS_PATH, when, when);
    expect(C.credentialsChangedAt(C.readCredentials()!)).toBe(when.getTime());
  });

  it("treats the first Keychain sighting as long settled, and a later change as now", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    expect(C.credentialsChangedAt(C.readCredentials()!)).toBe(0);

    const rotated = JSON.stringify({ claudeAiOauth: { accessToken: "rotated" } });
    execFileMock.mockImplementation(() => rotated);
    const before = Date.now();
    const fresh = C.readCredentialsForWrite();
    if (fresh.state !== "ok") throw new Error("expected a Keychain read");
    const changedAt = C.credentialsChangedAt(fresh.live);
    expect(changedAt).toBeGreaterThanOrEqual(before);
  });

  it("returns now for Keychain bytes it has not observed", () => {
    const unseen = {
      raw: SAMPLE_RAW,
      blob: {},
      source: { kind: "keychain-darwin" as const, locator: "x" },
      hash: "never-read",
    };
    const before = Date.now();
    expect(C.credentialsChangedAt(unseen)).toBeGreaterThanOrEqual(before);
  });
});

describe("a blob without an account token", () => {
  const originalPlatform = process.platform;
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });
  const MCP_ONLY = JSON.stringify({ mcpOAuth: { linear: { accessToken: "l" } } });

  it("reads as signed out for display, without falling back to a leftover file", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    execFileMock.mockImplementation(() => MCP_ONLY);
    expect(C.readCredentials()).toBeNull();
    expect(C.readCredentialsStatus().state).toBe("missing");
  });

  it("is reported to writers with its store and bytes", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => MCP_ONLY);
    const status = C.readCredentialsForWrite();
    expect(status.state).toBe("no-account-token");
    if (status.state === "no-account-token") {
      expect(status.live.source.kind).toBe("keychain-darwin");
      expect(status.live.raw).toBe(MCP_ONLY);
    }
  });

  it("is reported for the file backend too", () => {
    fs.writeFileSync(CREDENTIALS_PATH, MCP_ONLY);
    expect(C.readCredentialsStatus().state).toBe("missing");
    expect(C.readCredentialsForWrite().state).toBe("no-account-token");
  });
});

/**
 * With `CLAUDE_CONFIG_DIR` set, Claude Code 2.1.287 keys its Keychain item
 * by `-` + the first 8 hex digits of sha256(dir). A fixed name would read,
 * and on an account switch overwrite, the default directory's login.
 */
describe("Keychain item for a custom CLAUDE_CONFIG_DIR", () => {
  const originalPlatform = process.platform;
  const CUSTOM_SERVICE = "Claude Code-credentials-cbe7f9b7"; // sha256("/Users/me/claude-work")
  const CUSTOM_LEGACY = "Claude Code-cbe7f9b7";

  beforeEach(async () => {
    configEnv.env = { CLAUDE_CONFIG_DIR: "/Users/me/claude-work" };
    vi.resetModules();
    C = await import("../credentials");
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
  });
  afterEach(() => {
    configEnv.env = {};
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });

  it("reads the hashed item, then the hashed legacy item — never the default one", () => {
    const services: string[] = [];
    execFileMock.mockImplementation((_bin: string, args: string[]) => {
      services.push(args[args.indexOf("-s") + 1]);
      throw makeStatusError(44);
    });
    expect(C.readCredentials()).toBeNull();
    expect(services).toEqual([CUSTOM_SERVICE, CUSTOM_LEGACY]);
  });

  it("writes an account switch to the hashed item", () => {
    let args: string[] = [];
    execFileMock.mockImplementation((_bin: string, a: string[]) => {
      if (a[0] === "add-generic-password") args = a;
      return "";
    });
    expect(C.defaultTargetSource()).toEqual({ kind: "keychain-darwin", locator: CUSTOM_SERVICE });
    expect(C.writeCredentials(SAMPLE_RAW, C.defaultTargetSource())).toBe(true);
    expect(args[args.indexOf("-s") + 1]).toBe(CUSTOM_SERVICE);
  });
});
