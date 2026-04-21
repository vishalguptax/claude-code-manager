/**
 * Account tab integration — mount/unmount lifecycle for the tab system.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { initAccountApi, sendGetAccountData, sendFetchQuota } from "./api";
import {
  setAccountData,
  setLoading,
  setQuotaStatus,
  getQuotaStatus,
  hasQuotaOptIn,
  getQuotaCacheAgeMs,
  clearQuotaCache,
  hydrateFromPersistence,
  QUOTA_CACHE_TTL_MS,
} from "./state";
import { renderAccount } from "./view";
import type { AccountData } from "../types";
import type { QuotaResult } from "../quota";

let _container: HTMLElement | null = null;
let _messageHandler: ((event: MessageEvent) => void) | null = null;
/**
 * Identity of the active Claude account at the last render. When this
 * changes on a new `accountData` message, we treat it as an account
 * switch and invalidate the quota cache so the numbers belong to the
 * right user. Uses email + slug so a null-slug "unsaved" account
 * still gets distinguished from a saved one with the same email.
 */
let _lastAccountKey: string | null = null;

function computeAccountKey(data: AccountData): string {
  const slug = data.activeProfileSlug ?? "";
  const email = data.profile.email ?? "";
  return `${slug}|${email}`;
}

/**
 * Mount the account view into the given container.
 */
export function mount(container: HTMLElement): void {
  _container = container;
  container.innerHTML = `<div class="panel"><div class="loading">Loading account...</div></div>`;

  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;
    if (msg.type === "accountData") {
      const fresh = msg.data as AccountData;
      const freshKey = computeAccountKey(fresh);
      // Account switch detected: identity changed since last render.
      // Drop the stale quota cache so we don't display previous
      // user's numbers. Re-fetch below if still opted in.
      if (_lastAccountKey !== null && _lastAccountKey !== freshKey) {
        clearQuotaCache();
      }
      _lastAccountKey = freshKey;
      setAccountData(fresh);
      setLoading(false);
      if (_container) renderAccount(_container);
      // Opt-in still live → refresh for the new account right away.
      if (
        hasQuotaOptIn() &&
        getQuotaStatus().kind !== "loading" &&
        getQuotaCacheAgeMs() === null
      ) {
        setQuotaStatus({ kind: "loading" });
        if (_container) renderAccount(_container);
        sendFetchQuota();
      }
    } else if (msg.type === "quotaData") {
      // Network call completed — success or error, either way we
      // re-render so the card shows the resolved state.
      const result = msg.result as QuotaResult;
      if (result.ok) {
        setQuotaStatus({ kind: "success", data: result.data });
      } else {
        setQuotaStatus({ kind: "error", error: result.error });
      }
      if (_container) renderAccount(_container);
    } else if (msg.type === "accountError") {
      setLoading(false);
      if (_container) {
        _container.innerHTML = `<div class="panel"><div class="empty">Error: ${msg.message}</div></div>`;
      }
    }
  };

  window.addEventListener("message", _messageHandler);

  // Persistence wiring is set up in main.ts before any tab mounts,
  // so pulling persisted state here is now safe (unlike at module-
  // load time, where ESM import hoisting ran us too early).
  hydrateFromPersistence();

  setLoading(true);
  sendGetAccountData();

  // Quota auto-fetch policy:
  //   1. User hasn't opted in yet → stay idle, user clicks the CTA.
  //   2. Opted in + no cache       → fetch immediately (first run
  //      after opt-in survived a reload with cache cleared).
  //   3. Opted in + cache stale    → fetch in the background; cached
  //      value is already painted so UI stays snappy.
  //   4. Opted in + cache fresh    → do nothing. Tab-switch cost zero.
  if (hasQuotaOptIn()) {
    const age = getQuotaCacheAgeMs();
    if (age === null) {
      // Brand-new cache miss but opted in — reach out now.
      setQuotaStatus({ kind: "loading" });
      sendFetchQuota();
    } else if (age > QUOTA_CACHE_TTL_MS) {
      // Stale cache — keep the painted value, fetch fresh silently.
      // getQuotaStatus already reflects the cached success from the
      // module-load bootstrap, so we don't flip to loading here.
      sendFetchQuota();
    }
    // Fresh cache: no-op; the existing success status already paints.
  }
}

/**
 * Unmount the account view and clean up event listeners.
 */
export function unmount(): void {
  if (_messageHandler) {
    window.removeEventListener("message", _messageHandler);
    _messageHandler = null;
  }
  _container = null;
}

/**
 * Initialize the account tab with the VS Code API.
 */
export function initAccountTab(vscode: VSCodeAPI): void {
  initAccountApi(vscode);
}
