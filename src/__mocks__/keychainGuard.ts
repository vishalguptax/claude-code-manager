/**
 * Global test guard: no test may reach the developer's real macOS Keychain.
 *
 * On darwin the credentials module prefers the Keychain item Claude Code
 * stores the OAuth tokens in, so any suite that loads it without mocking
 * `child_process` would read (or, through a profile switch, write) real
 * credentials. Every `/usr/bin/security` call answers as "item not found"
 * (exit 44), so those suites fall back to the file path they fixture.
 * Suites that mock `child_process` themselves replace this module-level
 * mock and keep full control.
 */
import { vi } from "vitest";

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const execFileSync = ((file: string, ...rest: unknown[]) => {
    if (file === "/usr/bin/security" || file === "security") {
      throw Object.assign(new Error("Keychain access is disabled in tests"), { status: 44 });
    }
    return (actual.execFileSync as (...a: unknown[]) => unknown)(file, ...rest);
  }) as typeof actual.execFileSync;
  return { ...actual, execFileSync, default: { ...actual, execFileSync } };
});
