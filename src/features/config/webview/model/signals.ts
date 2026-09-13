/**
 * Reactive state for the Config webview tab. The tab consumes the same
 * `accountData` payload the host sends for the Account tab; here we keep a
 * config-local copy plus the two pieces of pure UI state the tab owns —
 * the permission scope toggle and the permission search box.
 *
 * Scope note: like the Account tab, scope + search are session-scoped (in
 * memory only). They reset on a full webview reload, which is acceptable
 * for a settings surface the user is actively interacting with.
 */
import { signal } from "@preact/signals";
import {
  _resetSections,
  isSectionCollapsed as isSectionCollapsedShared,
  toggleSection as toggleSectionShared,
} from "../../../../webview/shared/model";
import type { AccountData, PermissionScope } from "../../types";

/** Latest account/settings payload from the host, or null until first load. */
export const configData = signal<AccountData | null>(null);
/** True while the initial `getAccountData` round-trip is in flight. */
export const loading = signal<boolean>(false);
/** Host-reported error, empty when none. */
export const configError = signal<string>("");

/** Active permission scope shown in the Permissions section. */
export const permissionScope = signal<PermissionScope>("global");
/** Live permission search query (filters the allow/deny lists). */
export const permissionSearch = signal<string>("");

/** Test-only: reset every signal to its initial value. */
export function _resetConfigState(): void {
  configData.value = null;
  loading.value = false;
  configError.value = "";
  permissionScope.value = "global";
  permissionSearch.value = "";
  _resetSections();
}

/**
 * Section collapse, namespaced to this tab. The store lives in shared/model
 * because Account needs the same behaviour; the prefix stops two tabs that
 * both have a section called "permissions" from folding each other's.
 */
export function isSectionCollapsed(id: string): boolean {
  return isSectionCollapsedShared(`config:${id}`);
}

export function toggleSection(id: string): void {
  toggleSectionShared(`config:${id}`);
}
