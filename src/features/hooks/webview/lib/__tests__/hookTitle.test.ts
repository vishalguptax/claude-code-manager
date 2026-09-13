import { describe, it, expect } from "vitest";
import { hookTitle } from "../hookTitle";

describe("hookTitle", () => {
  // The common shape: a script in .claude/hooks. The filename is the name the
  // author already chose; separators are only there because a filesystem
  // made them pick one.
  it("names a hook after its script, with separators read as spaces", () => {
    expect(hookTitle(".claude/hooks/guard-push.sh")).toBe("guard push");
    expect(hookTitle("~/.claude/hooks/caveman_activate.sh")).toBe("caveman activate");
    expect(hookTitle(".binaryos/scripts/subagent-stop.sh")).toBe("subagent stop");
  });

  // A script anywhere in the command beats any prefix: the runner is not the
  // point, the script is.
  it("finds the script even behind a runner", () => {
    expect(hookTitle("pnpm exec node ./scripts/guard-push.sh")).toBe("guard push");
    expect(hookTitle("bash .claude/hooks/trace.sh --verbose")).toBe("trace");
  });

  it("ignores a leading environment assignment", () => {
    expect(hookTitle("DEBUG=1 .claude/hooks/trace.sh")).toBe("trace");
  });

  // No script: the first word that is not shell plumbing, plus the next one
  // when the first is only a runner.
  it("names an inline command by its real verb", () => {
    expect(hookTitle('pnpm exec prettier --write "$FILE"')).toBe("prettier");
    expect(hookTitle("npx eslint --fix")).toBe("eslint");
    expect(hookTitle('echo "Writing..."')).toBe("echo");
  });

  it("returns a short command as its own name", () => {
    expect(hookTitle("make lint")).toBe("make lint");
  });

  // Empty is the one case the caller must handle — it falls back to the event
  // label rather than rendering a nameless row.
  it("returns empty for an empty command so the caller can fall back", () => {
    expect(hookTitle("")).toBe("");
    expect(hookTitle("   ")).toBe("");
  });

  it("never returns only whitespace", () => {
    for (const cmd of ["./x.sh", "-", "sh", "node", "/a/b/c.js"]) {
      expect(hookTitle(cmd).trim()).toBe(hookTitle(cmd));
    }
  });
});
