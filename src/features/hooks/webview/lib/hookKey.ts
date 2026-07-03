import type { Hook } from "../../types";

/**
 * Stable identity for a hook row: scope + event + disabled state +
 * its position in the settings.json array. Two hooks that share a
 * matcher/command (duplicates, or an enabled/disabled pair with the
 * same bytes) still get distinct keys because they occupy different
 * array slots — this is what the parser hands back as
 * `entryIndex`/`commandIndex`.
 */
export function hookKey(hook: Hook): string {
  return `${hook.scope}:${hook.event}:${hook.disabled ? "d" : "a"}:${hook.entryIndex}:${hook.commandIndex ?? "flat"}`;
}
