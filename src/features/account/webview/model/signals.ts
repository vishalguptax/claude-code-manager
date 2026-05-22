/**
 * Reactive state for the account webview. Replaces the v1 vanilla
 * `state.ts` getter/setter module with @preact/signals so views
 * re-render automatically when any of these change.
 *
 * Scope note: collapse + quota state is session-scoped (lives only for
 * the lifetime of the webview). The v1 module persisted these via the
 * shared `persistence` helper, but the F1 webview shell (`main.tsx`,
 * read-only here) does not call `initPersistence`, so that store is
 * unwired. Rather than reach outside the feature boundary, we keep the
 * state in-memory; the cost is that collapse + quota-opt-in reset on a
 * full webview reload, which is acceptable for identity-only state.
 */

import { computed, signal } from "@preact/signals";
import type { AccountData } from "../../types";
import type { QuotaData, QuotaError } from "../../quota";

export type TimePeriod = "all" | "week" | "month";

/**
 * Quota card UI state machine. `idle` renders the "Check quota" CTA,
 * `loading` shows the spinner, `success` renders the bars, `error`
 * renders a precise message with a retry button.
 */
export type QuotaStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: QuotaData }
  | { kind: "error"; error: QuotaError };

/**
 * How long a cached quota response stays fresh before a background
 * refetch. 5 min: long enough that tab switches stay free, short
 * enough that the numbers still feel live. Matches v1.
 */
export const QUOTA_CACHE_TTL_MS = 5 * 60 * 1000;

/** Full account payload from the host, or null until first load. */
export const accountData = signal<AccountData | null>(null);
/** True while the initial `getAccountData` round-trip is in flight. */
export const loading = signal<boolean>(false);
/** Host-reported fatal error (accountError message). Empty when none. */
export const accountError = signal<string>("");

/** Selected usage time-period filter. */
export const timePeriod = signal<TimePeriod>("month");

/** Set of collapsed section ids ("profile", "quota", "usage"). */
export const collapsedSections = signal<ReadonlySet<string>>(new Set());

/** Whether the user opted into the (network) quota fetch. */
export const quotaOptIn = signal<boolean>(false);
/** Current quota card state. */
export const quotaStatus = signal<QuotaStatus>({ kind: "idle" });
/** Epoch ms of the last successful quota fetch, or null when none. */
export const quotaFetchedAtMs = signal<number | null>(null);

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

/**
 * Store a resolved quota result. Success updates the freshness stamp;
 * loading/error leave the last-good fetch time untouched so the
 * "fetched Xm ago" stamp keeps pointing at real data.
 */
export function setQuotaSuccess(data: QuotaData): void {
  quotaStatus.value = { kind: "success", data };
  quotaFetchedAtMs.value = Date.now();
}

export function setQuotaError(error: QuotaError): void {
  quotaStatus.value = { kind: "error", error };
}

export function setQuotaLoading(): void {
  quotaStatus.value = { kind: "loading" };
}

/**
 * Forget the cached quota and reset to idle. Called on an account
 * switch so the next render never shows the previous account's
 * numbers. The opt-in flag survives — the user shouldn't have to
 * re-consent per account.
 */
export function clearQuota(): void {
  quotaStatus.value = { kind: "idle" };
  quotaFetchedAtMs.value = null;
}

/** ms since the last successful quota fetch, or null when none. */
export function quotaCacheAgeMs(): number | null {
  const at = quotaFetchedAtMs.value;
  return at === null ? null : Math.max(0, Date.now() - at);
}

/** Test-only: reset every signal to its initial value. */
export function _resetAccountState(): void {
  accountData.value = null;
  loading.value = false;
  accountError.value = "";
  timePeriod.value = "month";
  collapsedSections.value = new Set();
  quotaOptIn.value = false;
  quotaStatus.value = { kind: "idle" };
  quotaFetchedAtMs.value = null;
}
