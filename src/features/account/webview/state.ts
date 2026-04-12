/**
 * Centralized state store for the account webview.
 */

import { getPersisted, setPersisted } from "../../../webview/persistence";
import type { AccountData, PermissionScope } from "../types";

const COLLAPSED_KEY = "account.collapsedSections";

// ── Raw state ──

let data: AccountData | null = null;
let loading = false;
let timePeriod: "all" | "week" | "month" = "month";
let permissionScope: PermissionScope = "global";
let collapsedSections: Set<string> = new Set(getPersisted<string[]>(COLLAPSED_KEY) ?? []);

// ── Getters ──

export function getAccountData(): AccountData | null { return data; }
export function isLoading(): boolean { return loading; }
export function getTimePeriod(): "all" | "week" | "month" { return timePeriod; }
export function getPermissionScope(): PermissionScope { return permissionScope; }
export function isSectionCollapsed(id: string): boolean { return collapsedSections.has(id); }

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
