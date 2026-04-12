/**
 * Account tab integration — mount/unmount lifecycle for the tab system.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { initAccountApi, sendGetAccountData } from "./api";
import { setAccountData, setLoading } from "./state";
import { renderAccount } from "./view";
import type { AccountData } from "../types";

let _container: HTMLElement | null = null;
let _messageHandler: ((event: MessageEvent) => void) | null = null;

/**
 * Mount the account view into the given container.
 */
export function mount(container: HTMLElement): void {
  _container = container;
  container.innerHTML = `<div class="panel"><div class="loading">Loading account...</div></div>`;

  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;
    if (msg.type === "accountData") {
      setAccountData(msg.data as AccountData);
      setLoading(false);
      if (_container) renderAccount(_container);
    } else if (msg.type === "accountError") {
      setLoading(false);
      if (_container) {
        _container.innerHTML = `<div class="panel"><div class="empty">Error: ${msg.message}</div></div>`;
      }
    }
  };

  window.addEventListener("message", _messageHandler);

  setLoading(true);
  sendGetAccountData();
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
