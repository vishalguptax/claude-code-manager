#!/usr/bin/env node
/**
 * Rename hook executed by Claude CLI on SessionStart and UserPromptSubmit.
 * Reads the hook payload from stdin (`{ session_id, hook_event_name, … }`)
 * and, when a rename made in the sidebar is pending for that session,
 * prints it as the hook's `sessionTitle`. Claude Code then renames the
 * session itself — prompt box, terminal title, `/resume` picker, transcript
 * — exactly as a `/rename` would. See pendingRenames.
 *
 * SessionStart covers a session started or resumed after the rename;
 * UserPromptSubmit covers one already running, on its next prompt.
 *
 * Exits 0 with no output when there is nothing to hand over. Every failure
 * (malformed payload, unreadable file) is swallowed: the hook runs before
 * every prompt and MUST NOT block or noisily fail.
 */
import { renameHookOutput, type HookPayload } from "./renameHook";

function readStdin(): Promise<HookPayload | null> {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(raw) as HookPayload);
      } catch {
        resolve(null);
      }
    });
    process.stdin.on("error", () => resolve(null));
  });
}

void readStdin().then((payload) => {
  const output = renameHookOutput(payload);
  if (output) process.stdout.write(output);
});
