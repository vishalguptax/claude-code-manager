/**
 * Enabling and disabling a plugin.
 *
 * This writes `enabledPlugins` inside a settings.json that Claude Code owns
 * and reads on every launch, so two things are non-negotiable: the scope is
 * always explicit (never "wherever it happened to be set"), and sibling keys
 * — other plugins, and everything else in the file — survive untouched.
 *
 * The actual write is INJECTED rather than performed here. The extension
 * already owns exactly one safe settings writer (`writeSettingsValue` in
 * `src/features/account/parser.ts`: it refuses to write into a file it
 * cannot parse, snapshots before mutating, and renames a temp file into
 * place atomically). Re-implementing any part of that in a second feature
 * would be a second chance to corrupt a user's config, and reaching across
 * into another feature's module at runtime is not a boundary this feature
 * gets to cross. So the host passes the writer in — see
 * {@link SettingsWriter} — and this module contributes only the part that is
 * genuinely about plugins: computing the next `enabledPlugins` map.
 *
 * With no writer supplied the feature is read-only and says so, which is the
 * correct degraded state rather than a silent no-op.
 */
import type { ClaudeSettingsScope } from "../../core/config";
import {
  isSafePluginId,
  normaliseEnabledValue,
  readSettingsScope,
  settingsScopePaths,
} from "./parser";
import type { PluginSettingsScope } from "./types";

/**
 * Write one top-level settings key at an explicit scope, returning whether
 * it landed. Structurally `writeSettingsValue(key, value, scope, workspace)`.
 */
export type SettingsWriter = (
  key: string,
  value: unknown,
  scope: ClaudeSettingsScope,
  workspacePath?: string,
) => boolean;

/** Outcome of a toggle, phrased for a `showErrorMessage`. */
export interface SetPluginEnabledResult {
  ok: boolean;
  error?: string;
}

/**
 * Narrow a plugin scope to a writable settings scope.
 *
 * `managed` is the admin policy file. It is not ours to edit, and on macOS
 * it is not even writable without elevation.
 */
export function writableScope(scope: PluginSettingsScope): ClaudeSettingsScope | null {
  return scope === "managed" ? null : scope;
}

/**
 * Compute the next `enabledPlugins` map.
 *
 * `current` is whatever the target file holds under that key today. Entries
 * for other plugins are copied verbatim, including the extended
 * object/array forms Claude Code accepts for version pinning — normalising
 * them to booleans on the way past would quietly drop another plugin's
 * version constraint as a side effect of toggling this one.
 *
 * Returns null when `current` exists but is not an object: the file means
 * something we do not understand, and overwriting it is not a repair.
 */
export function planEnabledPlugins(
  current: unknown,
  id: string,
  enabled: boolean,
): Record<string, unknown> | null {
  if (!isSafePluginId(id)) return null;
  if (current === undefined || current === null) return { [id]: enabled };
  if (typeof current !== "object" || Array.isArray(current)) return null;

  const next: Record<string, unknown> = { ...(current as Record<string, unknown>) };
  const existing = next[id];

  // Preserve an extended entry's payload when only the switch is changing:
  // `{ "version": "2.x", "enabled": true }` stays pinned when disabled and
  // re-enabled, instead of collapsing to a bare `true`.
  if (
    existing !== undefined &&
    typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing) &&
    normaliseEnabledValue(existing) !== null
  ) {
    next[id] = { ...(existing as Record<string, unknown>), enabled };
  } else {
    next[id] = enabled;
  }
  return next;
}

/**
 * Resolve the settings file for a plugin scope. Goes through
 * `settingsScopePaths` so the managed-settings location — which
 * `core/config` does not know about — stays defined in exactly one place.
 */
function scopeFilePath(
  scope: PluginSettingsScope,
  workspacePath: string | undefined,
): string | null {
  return settingsScopePaths(workspacePath).find((p) => p.scope === scope)?.filePath ?? null;
}

/**
 * Set `enabledPlugins[id]` at `scope`.
 *
 * Reads the target file first so the merge happens against what is on disk
 * right now, not against the snapshot the webview is rendering — the user
 * may have edited settings.json in the editor since the tab last loaded.
 */
export function setPluginEnabled(
  id: string,
  enabled: boolean,
  scope: PluginSettingsScope,
  workspacePath: string | undefined,
  write: SettingsWriter | undefined,
): SetPluginEnabledResult {
  if (!isSafePluginId(id)) {
    return { ok: false, error: `"${id}" is not a valid plugin id.` };
  }

  const target = writableScope(scope);
  if (target === null) {
    return {
      ok: false,
      error:
        "Managed settings are controlled by your organisation and cannot be edited from Claude Manager.",
    };
  }
  if (target !== "global" && !workspacePath) {
    return { ok: false, error: `No workspace folder open, so there is no ${target} settings file.` };
  }
  if (!write) {
    return {
      ok: false,
      error:
        "Claude Manager can't write settings.json yet — open the settings file and edit enabledPlugins directly.",
    };
  }

  const settingsPath = scopeFilePath(scope, workspacePath);
  if (settingsPath === null) {
    return { ok: false, error: `Could not resolve the ${scope} settings file.` };
  }

  const read = readSettingsScope(scope, settingsPath);
  if (read.error) return { ok: false, error: read.error };

  const next = planEnabledPlugins(read.data?.enabledPlugins, id, enabled);
  if (next === null) {
    return {
      ok: false,
      error: `"enabledPlugins" in ${settingsPath} is not an object — fix it by hand before toggling plugins here.`,
    };
  }

  const ok = write("enabledPlugins", next, target, workspacePath);
  return ok
    ? { ok: true }
    : { ok: false, error: `Failed to write ${settingsPath}.` };
}

