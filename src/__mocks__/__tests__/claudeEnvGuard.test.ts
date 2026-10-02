import { describe, expect, it } from "vitest";
import { CLAUDE_DIR } from "../../core/config";
import * as os from "os";
import * as path from "path";

describe("claude env guard", () => {
  it("clears the variables that move Claude Code's files", () => {
    expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
    expect(process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBeUndefined();
  });

  it("so config resolves the default layout", () => {
    expect(CLAUDE_DIR).toBe(path.join(os.homedir(), ".claude"));
  });
});
