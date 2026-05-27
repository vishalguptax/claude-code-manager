/**
 * Install / uninstall the statusline tap (extension-host side).
 *
 * Installing wires Claude Code's `statusLine.command` to our bundled
 * tap script so that, on every render, Claude Code feeds the tap its
 * payload — letting us cache the server-computed rate-limit data with
 * no network call (see statuslineCore / statuslineTap). It is strictly
 * opt-in: the user triggers it from the Account panel, and uninstall
 * restores their previous statusline exactly.
 *
 * Why copy the script to ~/.claude/ instead of pointing at the bundled
 * dist file: VS Code's extension directory is versioned, so its path
 * changes on every update and would orphan `statusLine.command`.
 * Copying to a stable path under ~/.claude/ keeps the wiring valid
 * across updates (the installer re-copies the current script each time).
 */
import * as fs from "fs";
import {
  CLAUDE_MANAGER_DIR,
  SETTINGS_FILE,
  STATUSLINE_CACHE_FILE,
  STATUSLINE_INNER_FILE,
  STATUSLINE_TAP_FILE,
} from "../../core/config";
import { writeSettingsValue } from "./parser";

/** The `statusLine.command` value we install — runs the copied tap. */
function tapCommand(): string {
  return `node "${STATUSLINE_TAP_FILE}"`;
}

/** Read the live global `statusLine.command`, or "" when unset. */
function readGlobalStatusLineCommand(): string {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const data = JSON.parse(raw) as { statusLine?: { command?: unknown } };
    const cmd = data.statusLine?.command;
    return typeof cmd === "string" ? cmd : "";
  } catch {
    return "";
  }
}

/** The user's original statusline command recorded at install, or "". */
function readInnerCommand(): string {
  try {
    const raw = fs.readFileSync(STATUSLINE_INNER_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { command?: unknown };
    return typeof parsed.command === "string" ? parsed.command : "";
  } catch {
    return "";
  }
}

/** True when `statusLine.command` currently points at our tap. */
export function isStatuslineInstalled(): boolean {
  return readGlobalStatusLineCommand().includes(STATUSLINE_TAP_FILE);
}

export type InstallResult = { ok: true } | { ok: false; error: string };

/**
 * Install the tap. `tapSourcePath` is the bundled dist/statusline-tap.js
 * (the host resolves it from its own __dirname). Idempotent: re-running
 * refreshes the copied script without clobbering the recorded original
 * command.
 */
export function installStatusline(tapSourcePath: string): InstallResult {
  try {
    fs.mkdirSync(CLAUDE_MANAGER_DIR, { recursive: true });
    fs.copyFileSync(tapSourcePath, STATUSLINE_TAP_FILE);

    // Record the command we're replacing so the tap can chain it and
    // uninstall can restore it — but only when it isn't already ours,
    // otherwise a re-install would overwrite the real original with our
    // own tap command. "" is recorded too (means "user had none").
    const existing = readGlobalStatusLineCommand();
    if (!existing.includes(STATUSLINE_TAP_FILE)) {
      fs.writeFileSync(
        STATUSLINE_INNER_FILE,
        JSON.stringify({ command: existing }, null, 2) + "\n",
      );
    }

    const ok = writeSettingsValue("statusLine.command", tapCommand(), "global");
    return ok ? { ok: true } : { ok: false, error: "settings-write-failed" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Remove the tap and restore the user's previous statusline. Restoring
 * an empty inner command deletes `statusLine.command` (the state before
 * we touched it). Best-effort cleanup of our own files — a leftover
 * cache file is harmless.
 */
export function uninstallStatusline(): InstallResult {
  try {
    const inner = readInnerCommand();
    // writeSettingsValue deletes the key when value is "" — which is
    // exactly "no statusline", the correct restore when the user had none.
    writeSettingsValue("statusLine.command", inner, "global");

    for (const f of [STATUSLINE_INNER_FILE, STATUSLINE_TAP_FILE, STATUSLINE_CACHE_FILE]) {
      try {
        fs.rmSync(f);
      } catch {
        // already gone — fine
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
