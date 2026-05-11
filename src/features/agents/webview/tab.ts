/**
 * Agents tab integration — provides mount/unmount lifecycle for the tab system.
 * The tab system calls mount() when switching to the Agents tab and
 * unmount() when switching away.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { skeletonListHtml } from "../../../webview/loader";
import { initAgentsApi, sendGetAgents } from "./api";
import { setAgents, setSelectedAgent, setLoading } from "./state";
import { renderAgentsList } from "./views/listView";
import type { Agent } from "../types";

let _container: HTMLElement | null = null;
let _messageHandler: ((event: MessageEvent) => void) | null = null;

/**
 * Mount the agents view into the given container.
 * Initializes the API, sends a request for agents, and sets up
 * a message listener for incoming data.
 *
 * @param container - The DOM element to render the agents view into
 */
export function mount(container: HTMLElement): void {
  _container = container;
  container.innerHTML = skeletonListHtml("Loading agents…");

  // Set up message listener for agents data
  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;

    if (msg.type === "agents") {
      setAgents(msg.data as Agent[]);
      setLoading(false);
      if (_container) renderAgentsList(_container);
    } else if (msg.type === "agentsError") {
      setLoading(false);
      if (_container) {
        _container.innerHTML = `<div class="empty">Error: ${msg.message}</div>`;
      }
    }
  };

  window.addEventListener("message", _messageHandler);

  // Request agents from the extension host
  setLoading(true);
  sendGetAgents();
}

/**
 * Unmount the agents view and clean up event listeners.
 * Called when switching away from the Agents tab.
 */
export function unmount(): void {
  if (_messageHandler) {
    window.removeEventListener("message", _messageHandler);
    _messageHandler = null;
  }
  setSelectedAgent(null);
  _container = null;
}

/**
 * Initialize the agents tab with the VS Code API instance.
 * Must be called once before mount().
 *
 * @param vscode - The VS Code API instance from acquireVsCodeApi()
 */
export function initAgentsTab(vscode: VSCodeAPI): void {
  initAgentsApi(vscode);
}
