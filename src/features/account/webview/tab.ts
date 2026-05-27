/**
 * Account tab integration — mount/unmount lifecycle for the tab system.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { skeletonListHtml } from "../../../webview/loader";
import { initAccountApi, sendGetAccountData, sendFetchQuota } from "./api";
import {
  setAccountData,
  setLoading,
  setQuotaStatus,
  clearQuotaCache,
  hydrateFromPersistence,
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
  container.innerHTML = `<div class="panel">${skeletonListHtml("Loading account…")}</div>`;

  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;
    if (msg.type === "accountData") {
      const fresh = msg.data as AccountData;
      const freshKey = computeAccountKey(fresh);
      // Account switch detected: identity changed since last render.
      // Drop the stale quota and re-read for the new account so we
      // never display the previous user's numbers.
      const switched = _lastAccountKey !== null && _lastAccountKey !== freshKey;
      _lastAccountKey = freshKey;
      setAccountData(fresh);
      setLoading(false);
      if (switched) {
        clearQuotaCache();
        setQuotaStatus({ kind: "loading" });
      }
      if (_container) renderAccount(_container);
      if (switched) sendFetchQuota();
    } else if (msg.type === "quotaData") {
      // Local cache read completed — success or error, either way we
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

  // Quota is a free local read (the host reads the statusline cache),
  // so always pull it on mount — no opt-in gate. The host replies with
  // the not-installed state when the tap isn't wired yet, which the
  // view renders as the "Enable live quota" CTA.
  setQuotaStatus({ kind: "loading" });
  sendFetchQuota();
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
