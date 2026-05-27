/**
 * Centralized state store for the account webview.
 *
 * Quota now comes from the local statusline cache (see ../quota) — no
 * network call, no OAuth token. Reading it is free, so there's no opt-in
 * to persist and no need to cache the numbers across reloads: the panel
 * re-reads on mount and on refresh. The one explicit action is
 * installing the statusline tap, which lives in settings.json (host),
 * not here.
 */

import { getPersisted, setPersisted } from "../../../webview/persistence";
import type { AccountData, PermissionScope } from "../types";
import type { QuotaError, QuotaSuccess } from "../quota";

const COLLAPSED_KEY = "account.collapsedSections";

/**
 * Quota card UI state machine. `idle` is the pre-mount placeholder,
 * `loading` shows the spinner, `success` renders the bars + live
 * session, `error` renders a typed message (not-installed → install
 * CTA; no-data → "run a session, then refresh").
 */
export type QuotaStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: QuotaSuccess }
  | { kind: "error"; error: QuotaError };

// ── Raw state ──

let data: AccountData | null = null;
let loading = false;
let timePeriod: "all" | "week" | "month" = "month";
let permissionScope: PermissionScope = "global";
// Persistence-backed fields are NOT initialised at module eval time.
// ESM import hoisting runs this module before main.ts calls
// initPersistence(vscode), so getPersisted() would always see an
// unwired backend. Lazy-init on first read via hydrateFromPersistence().
let collapsedSections: Set<string> = new Set();
let collapsedHydrated = false;

let quotaStatus: QuotaStatus = { kind: "idle" };

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
}

// ── Getters ──

export function getAccountData(): AccountData | null { return data; }
export function isLoading(): boolean { return loading; }
export function getTimePeriod(): "all" | "week" | "month" { return timePeriod; }
export function getPermissionScope(): PermissionScope { return permissionScope; }
export function isSectionCollapsed(id: string): boolean { return collapsedSections.has(id); }
export function getQuotaStatus(): QuotaStatus { return quotaStatus; }

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
}

/**
 * Reset the quota card to idle. Called when the active Claude account
 * changes so the next render doesn't show the previous account's
 * numbers before the re-read resolves.
 */
export function clearQuotaCache(): void {
  quotaStatus = { kind: "idle" };
}
