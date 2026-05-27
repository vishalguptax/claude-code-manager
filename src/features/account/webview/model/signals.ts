/**
 * Reactive state for the account webview (@preact/signals) so views
 * re-render automatically when any of these change.
 *
 * Quota is now read from the local statusline cache (see ../../quota) —
 * no network call, no OAuth token. Reading it is free, so there is no
 * opt-in to persist: the panel reads on mount and on refresh. The one
 * deliberate action is *installing* the statusline tap, which is driven
 * by the host (install state lives in settings.json, not here).
 */

import { computed, signal } from "@preact/signals";
import type { AccountData } from "../../types";
import type { QuotaError, QuotaSuccess } from "../../quota";

export type TimePeriod = "all" | "week" | "month";

/**
 * Quota card UI state machine:
 *   - idle     → pre-mount placeholder (mount immediately moves to loading)
 *   - loading  → reading the cache
 *   - success  → bars + live session
 *   - error    → typed reason (not-installed → install CTA; no-data; parse)
 */
export type QuotaStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: QuotaSuccess }
  | { kind: "error"; error: QuotaError };

/** Full account payload from the host, or null until first load. */
export const accountData = signal<AccountData | null>(null);
/** True while the initial `getAccountData` round-trip is in flight. */
export const loading = signal<boolean>(false);
/** Host-reported fatal error (accountError message). Empty when none. */
export const accountError = signal<string>("");

/** Selected usage time-period filter. */
export const timePeriod = signal<TimePeriod>("month");

/** Set of collapsed section ids ("profile", "quota", "session", "usage"). */
export const collapsedSections = signal<ReadonlySet<string>>(new Set());

/** Current quota card state. */
export const quotaStatus = signal<QuotaStatus>({ kind: "idle" });

/** True when account data has loaded and a profile exists. */
export const hasAccount = computed(() => accountData.value !== null);

/** Whether the given section id is currently collapsed. */
export function isSectionCollapsed(id: string): boolean {
  return collapsedSections.value.has(id);
}

/** Toggle a section's collapsed state, producing a new Set for reactivity. */
export function toggleSection(id: string): void {
  const next = new Set(collapsedSections.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedSections.value = next;
}

export function setQuotaSuccess(data: QuotaSuccess): void {
  quotaStatus.value = { kind: "success", data };
}

export function setQuotaError(error: QuotaError): void {
  quotaStatus.value = { kind: "error", error };
}

export function setQuotaLoading(): void {
  quotaStatus.value = { kind: "loading" };
}

/**
 * Reset the quota card to idle. Called on an account switch so the next
 * render never shows the previous account's numbers before the re-read
 * resolves.
 */
export function clearQuota(): void {
  quotaStatus.value = { kind: "idle" };
}

/** Test-only: reset every signal to its initial value. */
export function _resetAccountState(): void {
  accountData.value = null;
  loading.value = false;
  accountError.value = "";
  timePeriod.value = "month";
  collapsedSections.value = new Set();
  quotaStatus.value = { kind: "idle" };
}
