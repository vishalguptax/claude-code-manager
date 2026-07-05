/**
 * Shared "the host is working" signal behind the global busy bar.
 *
 * Protocol: every message the webview posts is answered by exactly one
 * host `ack` when its handler finishes (see messageHandlers.ts). The
 * indicator arms only when a reply takes longer than a UI-noticeable
 * beat — instant round-trips never flash — and a safety timeout clears
 * it if the host dies mid-request so the bar can't get stuck.
 */
import { signal } from "@preact/signals";

/** True while a webview→host request has been outstanding > ARM_DELAY_MS. */
export const hostBusy = signal(false);

/** Don't show the bar for round-trips faster than this. */
const ARM_DELAY_MS = 300;
/** Force-clear if no ack ever arrives (host crashed / reloaded). */
const STUCK_TIMEOUT_MS = 15_000;

let outstanding = 0;
let armTimer: ReturnType<typeof setTimeout> | undefined;
let stuckTimer: ReturnType<typeof setTimeout> | undefined;

function reset(): void {
  outstanding = 0;
  clearTimeout(armTimer);
  clearTimeout(stuckTimer);
  armTimer = undefined;
  stuckTimer = undefined;
  hostBusy.value = false;
}

/** Call when the webview posts a message to the host. */
export function noteRequest(): void {
  outstanding++;
  if (armTimer === undefined && !hostBusy.value) {
    armTimer = setTimeout(() => {
      armTimer = undefined;
      if (outstanding > 0) hostBusy.value = true;
    }, ARM_DELAY_MS);
  }
  clearTimeout(stuckTimer);
  stuckTimer = setTimeout(reset, STUCK_TIMEOUT_MS);
}

/** Call when a host `ack` arrives. */
export function noteAck(): void {
  if (outstanding > 0) outstanding--;
  if (outstanding === 0) reset();
}

/** Test-only: return to the initial state. */
export function _resetHostBusy(): void {
  reset();
}
