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

vi.mock("../../../core/config", () => ({
  CLAUDE_DIR: CLAUDE_DIR_TMP,
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

// Import AFTER mocks.
import {
  readCredentials,
  readCredentialsRaceSafe,
  writeCredentials,
  hashCredentials,
  detectSource,
  defaultTargetSource,
  probeKeychainStatus,
  isLoggedOut,
  deleteCredentials,
  CREDENTIALS_FILE,
  __internals,
} from "../credentials";

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
    const a = hashCredentials(SAMPLE_RAW);
    const b = hashCredentials(SAMPLE_RAW);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("differs for different bytes", () => {
    expect(hashCredentials(SAMPLE_RAW)).not.toBe(hashCredentials(SAMPLE_RAW + " "));
  });
});

describe("readCredentials — file backend", () => {
  it("returns null when no file exists and Keychain has no item", () => {
    expect(readCredentials()).toBeNull();
  });

  it("returns parsed blob + file source when the file is present", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const live = readCredentials();
    expect(live).not.toBeNull();
    expect(live!.source.kind).toBe("file");
    expect(live!.source.locator).toBe(CREDENTIALS_FILE);
    expect(live!.blob.claudeAiOauth?.accessToken).toBe("tok-abc");
    expect(live!.raw).toBe(SAMPLE_RAW);
    expect(live!.hash).toBe(hashCredentials(SAMPLE_RAW));
  });

  it("ignores an empty file", () => {
    fs.writeFileSync(CREDENTIALS_PATH, "");
    expect(readCredentials()).toBeNull();
  });

  it("ignores a file with invalid JSON", () => {
    fs.writeFileSync(CREDENTIALS_PATH, "{not-json");
    expect(readCredentials()).toBeNull();
  });

  it("ignores a file missing the claudeAiOauth.accessToken field", () => {
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({ claudeAiOauth: {} }));
    expect(readCredentials()).toBeNull();
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
      expect(bin).toBe(__internals.SECURITY_BIN);
      expect(args[0]).toBe("find-generic-password");
      expect(args).toContain("-s");
      expect(args).toContain(__internals.KEYCHAIN_SERVICE);
      return SAMPLE_RAW + "\n"; // trailing newline emulates `security` behaviour
    });
    const live = readCredentials();
    expect(live).not.toBeNull();
    expect(live!.source.kind).toBe("keychain-darwin");
    expect(live!.source.locator).toBe(__internals.KEYCHAIN_SERVICE);
    expect(live!.blob.claudeAiOauth?.accessToken).toBe("tok-abc");
  });

  it("falls back to the legacy `Claude Code` service name when the current one is absent", () => {
    pretendDarwin();
    let callCount = 0;
    execFileMock.mockImplementation((_bin: string, args: string[]) => {
      callCount++;
      const serviceArg = args[args.indexOf("-s") + 1];
      if (serviceArg === __internals.KEYCHAIN_SERVICE) {
        throw makeStatusError(44);
      }
      if (serviceArg === __internals.KEYCHAIN_LEGACY_SERVICE) {
        return SAMPLE_RAW;
      }
      throw makeStatusError(44);
    });
    const live = readCredentials();
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(live).not.toBeNull();
    expect(live!.source.locator).toBe(__internals.KEYCHAIN_LEGACY_SERVICE);
  });

  it("returns null on non-darwin even when the mock would have responded", () => {
    // Default platform — not darwin. The Keychain backend should not
    // be invoked at all (no `security` calls).
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    expect(readCredentials()).toBeNull();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("prefers the file backend when both file and Keychain have data (matches Claude CLI precedence)", () => {
    pretendDarwin();
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    execFileMock.mockImplementation(() =>
      JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token" } }),
    );
    const live = readCredentials();
    expect(live!.source.kind).toBe("file");
    expect(live!.blob.claudeAiOauth?.accessToken).toBe("tok-abc");
    // Keychain probe should not have been called — file hit short-circuited.
    expect(execFileMock).not.toHaveBeenCalled();
  });
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
    expect(probeKeychainStatus()).toBe("unsupported");
  });

  it("maps exit 51 → denied", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(51);
    });
    expect(probeKeychainStatus()).toBe("denied");
  });

  it("maps exit 25 → locked", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(25);
    });
    expect(probeKeychainStatus()).toBe("locked");
  });

  it("maps exit 36 → unreachable (SSH / headless)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(36);
    });
    expect(probeKeychainStatus()).toBe("unreachable");
  });

  it("returns 'absent' only when BOTH service names report absent", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(44);
    });
    expect(probeKeychainStatus()).toBe("absent");
  });

  it("returns 'ok' when the current service name has an item", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    expect(probeKeychainStatus()).toBe("ok");
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
    expect(isLoggedOut()).toBe(true);
  });

  it("false when the file is present (non-darwin)", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    expect(isLoggedOut()).toBe(false);
  });

  it("true on macOS when both file absent AND Keychain item absent", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(44);
    });
    expect(isLoggedOut()).toBe(true);
  });

  it("false on macOS when Keychain has the item", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => SAMPLE_RAW);
    expect(isLoggedOut()).toBe(false);
  });

  it("false on macOS when Keychain is locked (cannot confirm absent)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(25);
    });
    expect(isLoggedOut()).toBe(false);
  });
});

describe("writeCredentials — file backend", () => {
  it("writes bytes verbatim", () => {
    const ok = writeCredentials(SAMPLE_RAW, {
      kind: "file",
      locator: CREDENTIALS_FILE,
    });
    expect(ok).toBe(true);
    expect(fs.readFileSync(CREDENTIALS_PATH, "utf-8")).toBe(SAMPLE_RAW);
  });

  it("creates the .claude directory if missing", () => {
    fs.rmSync(CLAUDE_DIR_TMP, { recursive: true, force: true });
    const ok = writeCredentials(SAMPLE_RAW, {
      kind: "file",
      locator: CREDENTIALS_FILE,
    });
    expect(ok).toBe(true);
    expect(fs.existsSync(CREDENTIALS_PATH)).toBe(true);
  });

  it("does not leave a `.tmp` straggler after success", () => {
    writeCredentials(SAMPLE_RAW, { kind: "file", locator: CREDENTIALS_FILE });
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
    const ok = writeCredentials(SAMPLE_RAW, {
      kind: "keychain-darwin",
      locator: __internals.KEYCHAIN_SERVICE,
    });
    expect(ok).toBe(true);
    expect(captured.bin).toBe(__internals.SECURITY_BIN);
    expect(captured.args).toContain("add-generic-password");
    expect(captured.args).toContain("-U");
    expect(captured.args).toContain(__internals.KEYCHAIN_SERVICE);
    // The raw blob is passed as the `-w` value.
    const wIdx = captured.args!.indexOf("-w");
    expect(captured.args![wIdx + 1]).toBe(SAMPLE_RAW);
  });

  it("returns false on macOS when `security` exits non-zero", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(1);
    });
    const ok = writeCredentials(SAMPLE_RAW, {
      kind: "keychain-darwin",
      locator: __internals.KEYCHAIN_SERVICE,
    });
    expect(ok).toBe(false);
  });

  it("refuses to write to keychain-darwin on non-darwin platforms", () => {
    const ok = writeCredentials(SAMPLE_RAW, {
      kind: "keychain-darwin",
      locator: __internals.KEYCHAIN_SERVICE,
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
      deleteCredentials({ kind: "file", locator: CREDENTIALS_FILE }),
    ).toBe(true);
    expect(fs.existsSync(CREDENTIALS_PATH)).toBe(false);
  });

  it("treats an absent file as already gone (idempotent)", () => {
    expect(
      deleteCredentials({ kind: "file", locator: CREDENTIALS_FILE }),
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
      deleteCredentials({
        kind: "keychain-darwin",
        locator: __internals.KEYCHAIN_SERVICE,
      }),
    ).toBe(true);
    expect(args[0]).toBe("delete-generic-password");
    expect(args).toContain(__internals.KEYCHAIN_SERVICE);
  });

  it("treats exit 44 from `security delete` as success (already gone)", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    execFileMock.mockImplementation(() => {
      throw makeStatusError(44);
    });
    expect(
      deleteCredentials({
        kind: "keychain-darwin",
        locator: __internals.KEYCHAIN_SERVICE,
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
    const target = defaultTargetSource();
    expect(target.kind).toBe("file");
  });

  it("targets the Keychain on darwin when the file is absent", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    const target = defaultTargetSource();
    expect(target.kind).toBe("keychain-darwin");
    expect(target.locator).toBe(__internals.KEYCHAIN_SERVICE);
  });

  it("targets the file on darwin when a non-empty file already exists", () => {
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const target = defaultTargetSource();
    expect(target.kind).toBe("file");
  });
});

describe("detectSource", () => {
  it("returns the source of the live read or null", () => {
    expect(detectSource()).toBeNull();
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    expect(detectSource()?.kind).toBe("file");
  });
});

describe("readCredentialsRaceSafe", () => {
  it("returns the read when the hash is stable across two reads", () => {
    fs.writeFileSync(CREDENTIALS_PATH, SAMPLE_RAW);
    const live = readCredentialsRaceSafe();
    expect(live).not.toBeNull();
    expect(live!.hash).toBe(hashCredentials(SAMPLE_RAW));
  });

  it("returns null when no source has data", () => {
    expect(readCredentialsRaceSafe()).toBeNull();
  });
});
