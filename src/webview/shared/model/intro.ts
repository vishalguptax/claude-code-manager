/**
 * First-run intro state. The host persists whether the intro has played
 * (globalState `claudeManager.demoSeen`) and pushes that flag on the
 * sessions `settings` message; the webview surfaces it exactly once.
 *
 * `resolved` is a module-level latch, NOT a signal: the host may re-push
 * `settings` (install/uninstall of the Claude Code extension re-sends it)
 * with `demoSeen` still false in the window before `markDemoSeen` is
 * persisted, and we must not re-open the intro after the user dismissed
 * it this session. Once shown-or-closed, it stays closed until reload —
 * unless the user asks for it again, which {@link showIntro} always honours.
 */
import { signal } from "@preact/signals";

export const introVisible = signal<boolean>(false);

let resolved = false;

/**
 * Open the intro iff it has never played on this install and hasn't
 * already been resolved this session. Called from the sessions settings
 * handler with the host's persisted `demoSeen` flag.
 */
export function maybeShowIntro(demoSeen: boolean): void {
  if (!resolved && demoSeen === false) {
    resolved = true;
    introVisible.value = true;
  }
}

/**
 * Open the intro because the user asked to see it again (the footer's tour
 * button, the panel palette, or the host's Show Welcome Tour command).
 * Unlike {@link maybeShowIntro} this ignores `demoSeen` and the latch: a
 * request is always answered. It latches too, so a settings push arriving
 * while the replay is open cannot open a second copy.
 */
export function showIntro(): void {
  resolved = true;
  introVisible.value = true;
}

/** Close the intro for good this session (dismiss latches `resolved`). */
export function closeIntro(): void {
  resolved = true;
  introVisible.value = false;
}

/** Test-only: clear the latch and hide, so each case starts fresh. */
export function _resetIntro(): void {
  resolved = false;
  introVisible.value = false;
}
