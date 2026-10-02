import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";

describe("keychain guard", () => {
  it("answers every security call as item-not-found", () => {
    let status: unknown;
    try {
      execFileSync("/usr/bin/security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"]);
    } catch (err) {
      status = (err as { status?: number }).status;
    }
    expect(status).toBe(44);
  });

  it("passes other commands through", () => {
    expect(String(execFileSync("node", ["-e", "process.stdout.write('ok')"]))).toBe("ok");
  });
});
