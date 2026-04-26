import { describe, it, expect } from "vitest";
import { __internals } from "../runner";

const {
  collectHookCommands,
  readAdditionalDirs,
  isAbsolutePath,
  extractCmdHead,
  findExpiresAt,
} = __internals;

describe("collectHookCommands", () => {
  it("walks the nested hooks shape and pulls every command string", () => {
    const settings = {
      hooks: {
        PreToolUse: [
          { matcher: ".*", hooks: [{ command: "/usr/local/bin/foo" }, { command: "echo bar" }] },
        ],
        PostToolUse: [{ hooks: [{ command: "/opt/baz" }] }],
      },
    };
    expect(collectHookCommands(settings).sort()).toEqual([
      "/opt/baz",
      "/usr/local/bin/foo",
      "echo bar",
    ]);
  });

  it("returns empty when hooks block is absent or malformed", () => {
    expect(collectHookCommands({})).toEqual([]);
    expect(collectHookCommands({ hooks: "not-an-object" })).toEqual([]);
    expect(collectHookCommands(null)).toEqual([]);
  });
});

describe("readAdditionalDirs", () => {
  it("pulls the array under permissions.additionalDirectories", () => {
    expect(readAdditionalDirs({ permissions: { additionalDirectories: ["/a", "/b"] } })).toEqual([
      "/a",
      "/b",
    ]);
  });

  it("filters non-strings defensively", () => {
    expect(
      readAdditionalDirs({ permissions: { additionalDirectories: ["/a", 42, null] } }),
    ).toEqual(["/a"]);
  });

  it("returns empty when the key chain is missing", () => {
    expect(readAdditionalDirs({})).toEqual([]);
    expect(readAdditionalDirs(null)).toEqual([]);
  });
});

describe("extractCmdHead", () => {
  it("returns the path before the first space", () => {
    expect(extractCmdHead("/usr/bin/echo hi")).toBe("/usr/bin/echo");
  });
  it("unwraps a quoted absolute path", () => {
    expect(extractCmdHead('"/c/Program Files/x.exe" --flag')).toBe(
      "/c/Program Files/x.exe",
    );
  });
});

describe("isAbsolutePath", () => {
  it("returns true for unix absolute commands", () => {
    expect(isAbsolutePath("/usr/local/bin/x arg")).toBe(true);
  });
  it("returns false for bare-name commands", () => {
    expect(isAbsolutePath("echo hi")).toBe(false);
  });
});

describe("findExpiresAt", () => {
  it("finds a top-level expiresAt", () => {
    expect(findExpiresAt({ expiresAt: 12345 })).toBe(12345);
  });
  it("recurses into nested objects", () => {
    expect(findExpiresAt({ creds: { token: { expiresAt: 99 } } })).toBe(99);
  });
  it("returns null when no number-typed expiresAt is present", () => {
    expect(findExpiresAt({ expiresAt: "soon" })).toBeNull();
    expect(findExpiresAt({})).toBeNull();
    expect(findExpiresAt(null)).toBeNull();
  });
});
