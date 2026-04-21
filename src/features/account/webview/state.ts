/**
 * Centralized state store for the account webview.
 */

import { getPersisted, setPersisted } from "../../../webview/persistence";
import type { AccountData, PermissionScope } from "../types";
import type { QuotaData, QuotaError } from "../quota";

const COLLAPSED_KEY = "account.collapsedSections";
const QUOTA_OPTED_IN_KEY = "account.quotaOptedIn";
const QUOTA_CACHE_KEY = "account.quotaCache";

/**
 * How long a cached quota response stays fresh before the tab auto-
 * refetches in the background. 5 min: long enough to make tab
 * switches free, short enough that the numbers still feel live.
 */
export const QUOTA_CACHE_TTL_MS = 5 * 60 * 1000;

/** Persisted envelope for the last successful quota fetch. */
interface QuotaCacheEntry {
  data: QuotaData;
  fetchedAtMs: number;
}

/**
 * Quota card UI state machine. `idle` renders the "Fetch quota" CTA,
 * `loading` shows a skeleton + spinner, `success` renders the bars,
 * `error` renders a precise message with a retry button.
 */
export type QuotaStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: QuotaData }
  | { kind: "error"; error: QuotaError };

// ── Raw state ──

let data: AccountData | null = null;
let loading = false;
let timePeriod: "all" | "week" | "month" = "month";
let permissionScope: PermissionScope = "global";
// Persistence-backed fields are NOT initialised at module eval time.
// ESM import hoisting runs this module before main.ts calls
// initPersistence(vscode), so getPersisted() would always see an
// unwired backend and return undefined. Instead we lazy-init on the
// first read via `hydrateFromPersistence()`, called by the account
// tab's mount().
let collapsedSections: Set<string> = new Set();
let collapsedHydrated = false;

/** Whether user opted into the quota network call. Lazy-hydrated. */
let quotaOptedIn: boolean = false;
/** Last-seen quota status. Hydrated from cache on first mount. */
let quotaStatus: QuotaStatus = { kind: "idle" };
let quotaHydrated = false;

/**
 * Pull persisted values now that initPersistence has wired up the
 * vscode.setState-backed store. Safe to call repeatedly; subsequent
 * calls are no-ops so mount() doesn't clobber user changes.
 */
export function hydrateFromPersistence(): void {
  if (!collapsedHydrated) {
    collapsedSections = new Set(getPersisted<string[]>(COLLAPSED_KEY) ?? []);
    collapsedHydrated = true;
  }
  if (!quotaHydrated) {
    quotaOptedIn = getPersisted<boolean>(QUOTA_OPTED_IN_KEY) ?? false;
    const cached = getPersisted<QuotaCacheEntry>(QUOTA_CACHE_KEY);
    if (cached && cached.data && typeof cached.fetchedAtMs === "number") {
      quotaStatus = { kind: "success", data: cached.data };
    }
    quotaHydrated = true;
  }
}

// ── Getters ──

export function getAccountData(): AccountData | null { return data; }
export function isLoading(): boolean { return loading; }
export function getTimePeriod(): "all" | "week" | "month" { return timePeriod; }
export function getPermissionScope(): PermissionScope { return permissionScope; }
export function isSectionCollapsed(id: string): boolean { return collapsedSections.has(id); }
export function getQuotaStatus(): QuotaStatus { return quotaStatus; }
/** Whether the user previously opted into the quota network call. */
export function hasQuotaOptIn(): boolean { return quotaOptedIn; }
/**
 * ms since the last cached quota fetch, or null when no cache exists.
 * View uses this to decide whether to trigger a background refresh.
 */
export function getQuotaCacheAgeMs(): number | null {
  const cached = getPersisted<QuotaCacheEntry>(QUOTA_CACHE_KEY);
  if (!cached || typeof cached.fetchedAtMs !== "number") return null;
  return Math.max(0, Date.now() - cached.fetchedAtMs);
}

// ── Setters ──

export function setAccountData(d: AccountData | null): void { data = d; }
export function setLoading(v: boolean): void { loading = v; }
export function setTimePeriod(p: "all" | "week" | "month"): void { timePeriod = p; }
export function setPermissionScope(s: PermissionScope): void { permissionScope = s; }
export function toggleSection(id: string): void {
  if (collapsedSections.has(id)) collapsedSections.delete(id);
  else collapsedSections.add(id);
  setPersisted(COLLAPSED_KEY, [...collapsedSections]);
}
export function setQuotaStatus(s: QuotaStatus): void {
  quotaStatus = s;
  // Persist successful fetches so the next tab open paints instantly
  // with the last known value. Failures and loading states aren't
  // cached — only good data survives across sessions.
  if (s.kind === "success") {
    const entry: QuotaCacheEntry = { data: s.data, fetchedAtMs: Date.now() };
    setPersisted(QUOTA_CACHE_KEY, entry);
  }
}
/**
 * Flip the user's explicit opt-in. Set once on first manual fetch;
 * auto-fetch uses it on every subsequent tab open.
 */
export function setQuotaOptIn(v: boolean): void {
  quotaOptedIn = v;
  setPersisted(QUOTA_OPTED_IN_KEY, v);
}

/**
 * Forget the cached quota + reset status to idle. Called when the
 * active Claude account changes so the next render doesn't show the
 * previous account's numbers. Opt-in flag survives — user won't need
 * to re-consent on the new account.
 */
export function clearQuotaCache(): void {
  setPersisted(QUOTA_CACHE_KEY, undefined);
  quotaStatus = { kind: "idle" };
}
