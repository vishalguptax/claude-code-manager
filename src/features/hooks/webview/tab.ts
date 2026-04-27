/**
 * Hooks tab integration — provides mount/unmount lifecycle for the tab system.
 * The tab system calls mount() when switching to the Hooks tab and
 * unmount() when switching away.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { initHooksApi, sendGetHooks } from "./api";
import { setHooks, setLoading } from "./state";
import { renderHooksList } from "./views/listView";
import type { Hook } from "../types";

let _container: HTMLElement | null = null;
let _messageHandler: ((event: MessageEvent) => void) | null = null;

/**
 * Mount the hooks view into the given container.
 * Initializes the API, sends a request for hooks, and sets up
 * a message listener for incoming data.
 *
 * @param container - The DOM element to render the hooks view into
 */
export function mount(container: HTMLElement): void {
  _container = container;
  container.innerHTML = `<div class="panel-loader" role="status" aria-live="polite"><div class="panel-loader-spinner"></div><div class="panel-loader-text">Loading hooks…</div></div>`;

  // Set up message listener for hooks data
  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;

    if (msg.type === "hooks") {
      setHooks(msg.data as Hook[]);
      setLoading(false);
      if (_container) renderHooksList(_container);
    } else if (msg.type === "hooksError") {
      setLoading(false);
      if (_container) {
        _container.innerHTML = `<div class="empty">Error: ${msg.message}</div>`;
      }
    }
  };

  window.addEventListener("message", _messageHandler);

  // Request hooks from the extension host
  setLoading(true);
  sendGetHooks();
}

/**
 * Unmount the hooks view and clean up event listeners.
 * Called when switching away from the Hooks tab.
 */
export function unmount(): void {
  if (_messageHandler) {
    window.removeEventListener("message", _messageHandler);
    _messageHandler = null;
  }
  _container = null;
}

/**
 * Initialize the hooks tab with the VS Code API instance.
 * Must be called once before mount().
 *
 * @param vscode - The VS Code API instance from acquireVsCodeApi()
 */
export function initHooksTab(vscode: VSCodeAPI): void {
  initHooksApi(vscode);
}
