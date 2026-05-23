/**
 * Reactive state for the account webview. Replaces the v1 vanilla
 * `state.ts` getter/setter module with @preact/signals so views
 * re-render automatically when any of these change.
 *
 * Persistence scope: collapse state is session-scoped (in-memory only).
 * The quota opt-in IS persisted via the shared `persistence` bridge
 * (`main.tsx` calls `initPersistence`, so the setState/getState store is
 * live) — once a user clicks "Check quota" we remember the consent across
 * reloads so the 100%-local default only has to be cleared once. The cached
 * quota numbers themselves are NOT persisted; they're refetched on demand,
 * gated by that remembered opt-in (see index.tsx applyQuotaPolicy).
 */

import { computed, signal } from "@preact/signals";
import { getPersisted, setPersisted } from "../../../../webview/persistence";
import type { AccountData } from "../../types";
import type { QuotaData, QuotaError } from "../../quota";

/** Persistence key for the remembered quota network opt-in. */
const QUOTA_OPT_IN_KEY = "account.quotaOptIn";

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

/**
 * Whether the user opted into the (network) quota fetch. Default stays
 * `false` (100%-local until the user acts), but a persisted opt-in from a
 * previous session is loaded on mount via {@link loadPersistedQuotaOptIn}.
 */
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

/**
 * Record the user's quota opt-in and remember it across reloads. Called
 * the first (and every) time the user clicks "Check quota" / refresh, so a
 * subsequent Account open can auto-fetch without re-prompting.
 */
export function setQuotaOptIn(value: boolean): void {
  quotaOptIn.value = value;
  setPersisted(QUOTA_OPT_IN_KEY, value);
}

/**
 * Load the remembered opt-in into the signal on mount. No-ops when nothing
 * was persisted (stays the 100%-local `false` default) or when the
 * persistence bridge is unavailable (returns undefined).
 */
export function loadPersistedQuotaOptIn(): void {
  const stored = getPersisted<boolean>(QUOTA_OPT_IN_KEY);
  if (stored === true) quotaOptIn.value = true;
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
