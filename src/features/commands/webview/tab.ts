/**
 * Commands tab integration — provides mount/unmount lifecycle for the tab system.
 * The tab system calls mount() when switching to the Commands tab and
 * unmount() when switching away.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { initCommandsApi, sendGetCommands } from "./api";
import { setCommands, setSelectedCommand, setLoading } from "./state";
import { renderCommandsList } from "./views/listView";
import type { Command } from "../types";

let _container: HTMLElement | null = null;
let _messageHandler: ((event: MessageEvent) => void) | null = null;

/**
 * Mount the commands view into the given container.
 * Initializes the API, sends a request for commands, and sets up
 * a message listener for incoming data.
 *
 * @param container - The DOM element to render the commands view into
 */
export function mount(container: HTMLElement): void {
  _container = container;
  container.innerHTML = `<div class="panel-loader" role="status" aria-live="polite"><div class="panel-loader-spinner"></div><div class="panel-loader-text">Loading commands…</div></div>`;

  // Set up message listener for commands data
  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;

    if (msg.type === "commands") {
      setCommands(msg.data as Command[]);
      setLoading(false);
      if (_container) renderCommandsList(_container);
    } else if (msg.type === "commandsError") {
      setLoading(false);
      if (_container) {
        _container.innerHTML = `<div class="empty">Error: ${msg.message}</div>`;
      }
    }
  };

  window.addEventListener("message", _messageHandler);

  // Request commands from the extension host
  setLoading(true);
  sendGetCommands();
}

/**
 * Unmount the commands view and clean up event listeners.
 * Called when switching away from the Commands tab.
 */
export function unmount(): void {
  if (_messageHandler) {
    window.removeEventListener("message", _messageHandler);
    _messageHandler = null;
  }
  setSelectedCommand(null);
  _container = null;
}

/**
 * Initialize the commands tab with the VS Code API instance.
 * Must be called once before mount().
 *
 * @param vscode - The VS Code API instance from acquireVsCodeApi()
 */
export function initCommandsTab(vscode: VSCodeAPI): void {
  initCommandsApi(vscode);
}
