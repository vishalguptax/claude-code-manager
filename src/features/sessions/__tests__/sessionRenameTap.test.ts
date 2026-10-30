/**
 * The hook entry's own job: read Claude Code's payload from stdin and write
 * whatever renameHookOutput says to stdout, nothing otherwise. What it says
 * is pinned in renameHook.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "stream";

const output = vi.hoisted(() => ({ fn: vi.fn((_payload: unknown): string | null => null) }));
vi.mock("../renameHook", () => ({ renameHookOutput: output.fn }));

const realStdin = process.stdin;

/** Run the entry with `raw` on stdin; resolves with everything it wrote. */
async function runTap(raw: string): Promise<string> {
  Object.defineProperty(process, "stdin", { value: Readable.from([raw]), configurable: true });
  const written: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
  vi.resetModules();
  await import("../sessionRenameTap");
  await new Promise((resolve) => setTimeout(resolve, 20));
  return written.join("");
}

afterEach(() => {
  Object.defineProperty(process, "stdin", { value: realStdin, configurable: true });
  vi.restoreAllMocks();
  output.fn.mockReset();
});

describe("sessionRenameTap", () => {
  it("passes the parsed payload through and prints the answer", async () => {
    output.fn.mockReturnValue('{"hookSpecificOutput":{}}');
    const payload = { session_id: "s1", hook_event_name: "UserPromptSubmit" };

    expect(await runTap(JSON.stringify(payload))).toBe('{"hookSpecificOutput":{}}');
    expect(output.fn).toHaveBeenCalledWith(payload);
  });

  it("prints nothing when there is nothing to hand over", async () => {
    expect(await runTap('{"session_id":"s1"}')).toBe("");
  });

  it("treats unparseable input as no payload", async () => {
    await runTap("not json");
    expect(output.fn).toHaveBeenCalledWith(null);
  });
});
