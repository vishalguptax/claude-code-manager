/**
 * Config tab — owns the Settings + Permissions UI that previously
 * lived inside the Account tab. Both tabs consume the same
 * `accountData` payload; Config focuses on Claude-behavior config
 * (model, defaultMode, permissions, hooks-adjacent toggles) while
 * Account focuses on identity + usage + live limits.
 *
 * The split de-clutters Account (it was bottom-heavy) and gives
 * config-heavy users a dedicated surface without breaking the
 * familiar top-tab layout.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { skeletonListHtml } from "../../../webview/loader";
import { sendGetAccountData, initAccountApi } from "../../account/webview/api";
import type { AccountData, PermissionScope } from "../../account/types";
import { renderConfig, bindConfig } from "./view";

/** Module-local state — tiny enough that a dedicated state.ts is overkill. */
let _container: HTMLElement | null = null;
let _data: AccountData | null = null;
let _messageHandler: ((e: MessageEvent) => void) | null = null;
let _permissionScope: PermissionScope = "global";
let _permissionSearch = "";

export interface ConfigUiState {
  permissionScope: PermissionScope;
  permissionSearch: string;
}

export function getConfigUiState(): ConfigUiState {
  return { permissionScope: _permissionScope, permissionSearch: _permissionSearch };
}

export function setPermissionScope(scope: PermissionScope): void {
  _permissionScope = scope;
}

export function setPermissionSearch(q: string): void {
  _permissionSearch = q;
}

export function getData(): AccountData | null {
  return _data;
}

/** Re-render the config view with current data + UI state. */
export function rerender(): void {
  if (_container && _data) {
    renderConfig(_container, _data, getConfigUiState());
    bindConfig(_container, _data, {
      onScopeChange: (s) => {
        setPermissionScope(s);
        rerender();
      },
      onSearchChange: (q) => {
        setPermissionSearch(q);
        rerender();
      },
    });
  }
}

/**
 * Initialise shared deps. Called once from the webview entry point
 * (main.ts) before any tab activates. Kept symmetric with the Account
 * tab so both share the same underlying postMessage pipeline.
 */
export function initConfigTab(vscode: VSCodeAPI): void {
  // Account API is the authoritative writer for every setting this
  // tab edits — no need for a separate config-feature API module.
  // initAccountApi is idempotent if already called by the Account tab.
  initAccountApi(vscode);
}

export function mount(container: HTMLElement): void {
  _container = container;
  if (!_data) {
    container.innerHTML = `<div class="panel">${skeletonListHtml("Loading config…")}</div>`;
  }

  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;
    if (msg.type === "accountData") {
      _data = msg.data as AccountData;
      rerender();
    }
  };
  window.addEventListener("message", _messageHandler);

  // Pull fresh data. Account tab may already have it cached in the
  // extension host, but a re-request ensures Config renders the
  // current state on activation.
  sendGetAccountData();
}

export function unmount(): void {
  if (_messageHandler) {
    window.removeEventListener("message", _messageHandler);
    _messageHandler = null;
  }
  _container = null;
}
