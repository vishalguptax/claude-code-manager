import { afterEach, describe, expect, it } from "vitest";
import * as crypto from "crypto";
import * as path from "path";
import {
  claudeConfigDir,
  claudeGlobalConfigFile,
  claudeSecureStorageDir,
  keychainServiceName,
  oauthFileSuffix,
  publishClaudeEnv,
  publishedClaudeEnv,
  resolveClaudeEnv,
  sameClaudeEnv,
} from "../claudeHome";

const home = path.join(path.sep, "Users", "me");

/** The suffix Claude Code 2.1.287 derives: `-` + sha256(dir)[0..8]. */
function cliHash(dir: string): string {
  return crypto.createHash("sha256").update(dir.normalize("NFC")).digest("hex").substring(0, 8);
}

describe("resolveClaudeEnv", () => {
  it("is empty when nothing moves Claude Code's files", () => {
    expect(resolveClaudeEnv({}, undefined, "darwin")).toEqual({});
  });

  it("takes CLAUDE_CONFIG_DIR from the inherited environment", () => {
    expect(resolveClaudeEnv({ CLAUDE_CONFIG_DIR: "/alt" }, undefined, "linux")).toEqual({
      CLAUDE_CONFIG_DIR: "/alt",
    });
  });

  it("treats an empty inherited CLAUDE_CONFIG_DIR as unset", () => {
    expect(resolveClaudeEnv({ CLAUDE_CONFIG_DIR: "" }, undefined, "linux")).toEqual({});
  });

  it("reads the official extension's array setting, which overrides the environment", () => {
    const setting = [
      { name: "OTHER", value: "x" },
      { name: "CLAUDE_CONFIG_DIR", value: "/from-setting" },
    ];
    expect(resolveClaudeEnv({ CLAUDE_CONFIG_DIR: "/from-env" }, setting, "darwin")).toEqual({
      CLAUDE_CONFIG_DIR: "/from-setting",
    });
  });

  it("reads an object-map setting too", () => {
    expect(resolveClaudeEnv({}, { CLAUDE_CONFIG_DIR: "/map" }, "linux")).toEqual({
      CLAUDE_CONFIG_DIR: "/map",
    });
  });

  it("lets the last absolute entry win", () => {
    const setting = [
      { name: "CLAUDE_CONFIG_DIR", value: "/first" },
      { name: "CLAUDE_CONFIG_DIR", value: "/second" },
      { name: "CLAUDE_CONFIG_DIR", value: "relative" },
    ];
    expect(resolveClaudeEnv({}, setting, "linux").CLAUDE_CONFIG_DIR).toBe("/second");
  });

  it("does not expand ~ — the official extension ignores a non-absolute entry", () => {
    const setting = [{ name: "CLAUDE_CONFIG_DIR", value: "~/claude-work" }];
    expect(resolveClaudeEnv({}, setting, "darwin")).toEqual({});
    expect(resolveClaudeEnv({ CLAUDE_CONFIG_DIR: "/env" }, setting, "darwin")).toEqual({
      CLAUDE_CONFIG_DIR: "/env",
    });
  });

  it("on Windows needs a drive or UNC root and matches names case-insensitively", () => {
    expect(
      resolveClaudeEnv({}, [{ name: "claude_config_dir", value: "C:\\claude" }], "win32"),
    ).toEqual({ CLAUDE_CONFIG_DIR: "C:\\claude" });
    expect(
      resolveClaudeEnv({}, [{ name: "CLAUDE_CONFIG_DIR", value: "\\\\host\\share\\c" }], "win32"),
    ).toEqual({ CLAUDE_CONFIG_DIR: "\\\\host\\share\\c" });
    expect(resolveClaudeEnv({}, [{ name: "CLAUDE_CONFIG_DIR", value: "\\claude" }], "win32")).toEqual({});
    // POSIX names are case-sensitive.
    expect(resolveClaudeEnv({}, [{ name: "claude_config_dir", value: "/x" }], "linux")).toEqual({});
  });

  it("carries CLAUDE_SECURESTORAGE_CONFIG_DIR, including an empty value", () => {
    expect(resolveClaudeEnv({ CLAUDE_SECURESTORAGE_CONFIG_DIR: "" }, undefined, "darwin")).toEqual({
      CLAUDE_SECURESTORAGE_CONFIG_DIR: "",
    });
    expect(
      resolveClaudeEnv({}, [{ name: "CLAUDE_SECURESTORAGE_CONFIG_DIR", value: null }], "darwin"),
    ).toEqual({ CLAUDE_SECURESTORAGE_CONFIG_DIR: "" });
  });

  it("ignores malformed settings", () => {
    expect(resolveClaudeEnv({}, "CLAUDE_CONFIG_DIR=/x", "linux")).toEqual({});
    expect(resolveClaudeEnv({}, [null, 3, { value: "/x" }], "linux")).toEqual({});
  });
});

describe("paths", () => {
  it("default config dir and config file are ~/.claude and ~/.claude.json", () => {
    expect(claudeConfigDir({}, home)).toBe(path.join(home, ".claude"));
    expect(claudeGlobalConfigFile({}, home)).toBe(path.join(home, ".claude.json"));
    expect(claudeSecureStorageDir({}, home)).toBe(path.join(home, ".claude"));
  });

  it("a custom dir holds .claude.json inside it, not beside it", () => {
    const env = { CLAUDE_CONFIG_DIR: path.join(path.sep, "work", "claude") };
    expect(claudeConfigDir(env, home)).toBe(path.join(path.sep, "work", "claude"));
    expect(claudeGlobalConfigFile(env, home)).toBe(path.join(path.sep, "work", "claude", ".claude.json"));
  });

  it("drops a trailing separator from the custom dir", () => {
    const dir = path.join(path.sep, "work", "claude");
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: dir + path.sep }, home)).toBe(dir);
  });

  it("secure storage follows its own variable, empty meaning ~/.claude", () => {
    const dir = path.join(path.sep, "work", "claude");
    const secure = path.join(path.sep, "vault");
    expect(claudeSecureStorageDir({ CLAUDE_CONFIG_DIR: dir }, home)).toBe(dir);
    expect(
      claudeSecureStorageDir({ CLAUDE_CONFIG_DIR: dir, CLAUDE_SECURESTORAGE_CONFIG_DIR: secure }, home),
    ).toBe(secure);
    expect(
      claudeSecureStorageDir({ CLAUDE_CONFIG_DIR: dir, CLAUDE_SECURESTORAGE_CONFIG_DIR: "" }, home),
    ).toBe(path.join(home, ".claude"));
  });
});

describe("keychainServiceName", () => {
  it("is unsuffixed for the default dir", () => {
    expect(keychainServiceName({}, "-credentials")).toBe("Claude Code-credentials");
    expect(keychainServiceName({}, "")).toBe("Claude Code");
  });

  it("appends the CLI's hash of the custom dir", () => {
    const env = { CLAUDE_CONFIG_DIR: "/Users/me/claude-work" };
    // Literal expected names, so a change to the derivation cannot pass
    // by changing the helper above in step.
    expect(keychainServiceName(env, "-credentials")).toBe("Claude Code-credentials-cbe7f9b7");
    expect(keychainServiceName(env, "")).toBe("Claude Code-cbe7f9b7");
  });

  it("hashes the dir as written: a trailing slash is a different item", () => {
    expect(keychainServiceName({ CLAUDE_CONFIG_DIR: "/a/" }, "-credentials")).toBe(
      `Claude Code-credentials-${cliHash("/a/")}`,
    );
    expect(keychainServiceName({ CLAUDE_CONFIG_DIR: "/a/" }, "-credentials")).not.toBe(
      keychainServiceName({ CLAUDE_CONFIG_DIR: "/a" }, "-credentials"),
    );
  });

  it("hashes the NFC form, as the CLI does", () => {
    const decomposed = "/Users/me/cafe\u0301";
    expect(keychainServiceName({ CLAUDE_CONFIG_DIR: decomposed }, "-credentials")).toBe(
      `Claude Code-credentials-${cliHash("/Users/me/caf\u00e9")}`,
    );
  });

  it("lets CLAUDE_SECURESTORAGE_CONFIG_DIR decide the suffix", () => {
    const env = { CLAUDE_CONFIG_DIR: "/work", CLAUDE_SECURESTORAGE_CONFIG_DIR: "/vault" };
    expect(keychainServiceName(env, "-credentials")).toBe(`Claude Code-credentials-${cliHash("/vault")}`);
    expect(keychainServiceName({ ...env, CLAUDE_SECURESTORAGE_CONFIG_DIR: "" }, "-credentials")).toBe(
      "Claude Code-credentials",
    );
  });
});

describe("sameClaudeEnv", () => {
  it("compares both variables", () => {
    expect(sameClaudeEnv({}, {})).toBe(true);
    expect(sameClaudeEnv({ CLAUDE_CONFIG_DIR: "/a" }, { CLAUDE_CONFIG_DIR: "/a" })).toBe(true);
    expect(sameClaudeEnv({ CLAUDE_CONFIG_DIR: "/a" }, {})).toBe(false);
    expect(sameClaudeEnv({ CLAUDE_SECURESTORAGE_CONFIG_DIR: "" }, {})).toBe(false);
  });
});

describe("publishedClaudeEnv", () => {
  const slot = Symbol.for("claudeManager.claudeEnv");
  const saved = process.env.CLAUDE_CONFIG_DIR;
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[slot];
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  });

  it("falls back to the process environment when nothing was published", () => {
    process.env.CLAUDE_CONFIG_DIR = "/from-env";
    expect(publishedClaudeEnv()).toEqual({ CLAUDE_CONFIG_DIR: "/from-env" });
  });

  it("returns what the entry bundle published", () => {
    process.env.CLAUDE_CONFIG_DIR = "/from-env";
    publishClaudeEnv({ CLAUDE_CONFIG_DIR: "/from-setting" });
    expect(publishedClaudeEnv()).toEqual({ CLAUDE_CONFIG_DIR: "/from-setting" });
  });
});

describe("legacy .config.json", () => {
  it("wins over .claude.json whenever it exists in the config dir, default included", () => {
    const fs = require("fs") as typeof import("fs");
    const os = require("os") as typeof import("os");
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "csm-legacy-"));
    try {
      const custom = path.join(tmpHome, "custom");
      fs.mkdirSync(path.join(tmpHome, ".claude"));
      fs.mkdirSync(custom);
      expect(claudeGlobalConfigFile({}, tmpHome)).toBe(path.join(tmpHome, ".claude.json"));
      fs.writeFileSync(path.join(tmpHome, ".claude", ".config.json"), "{}");
      fs.writeFileSync(path.join(custom, ".config.json"), "{}");
      expect(claudeGlobalConfigFile({}, tmpHome)).toBe(path.join(tmpHome, ".claude", ".config.json"));
      expect(claudeGlobalConfigFile({ CLAUDE_CONFIG_DIR: custom }, tmpHome)).toBe(
        path.join(custom, ".config.json"),
      );
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});

describe("custom OAuth server suffix", () => {
  const oauth = { CLAUDE_CODE_CUSTOM_OAUTH_URL: "https://claude.fedstart.com" };

  it("renames the config file and Keychain item, as the CLI's OAUTH_FILE_SUFFIX does", () => {
    expect(oauthFileSuffix({})).toBe("");
    expect(oauthFileSuffix(oauth)).toBe("-custom-oauth");
    expect(claudeGlobalConfigFile(oauth, home)).toBe(path.join(home, ".claude-custom-oauth.json"));
    expect(keychainServiceName(oauth, "-credentials")).toBe("Claude Code-custom-oauth-credentials");
    expect(
      keychainServiceName({ ...oauth, CLAUDE_CONFIG_DIR: "/Users/me/claude-work" }, "-credentials"),
    ).toBe("Claude Code-custom-oauth-credentials-cbe7f9b7");
  });

  it("is read from the environment and the setting; empty means unset", () => {
    expect(resolveClaudeEnv({ CLAUDE_CODE_CUSTOM_OAUTH_URL: "" }, undefined, "darwin")).toEqual({});
    expect(resolveClaudeEnv(oauth, undefined, "darwin")).toEqual(oauth);
    expect(
      resolveClaudeEnv(oauth, [{ name: "CLAUDE_CODE_CUSTOM_OAUTH_URL", value: "" }], "darwin"),
    ).toEqual({});
    expect(sameClaudeEnv(oauth, {})).toBe(false);
  });

  it("ignores the staging and local switches, which shipped builds compile out", () => {
    expect(resolveClaudeEnv({ USE_STAGING_OAUTH: "1", USE_LOCAL_OAUTH: "1" }, undefined, "linux")).toEqual(
      {},
    );
  });
});
