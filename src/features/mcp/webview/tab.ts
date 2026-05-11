/**
 * MCP tab integration — provides mount/unmount lifecycle for the tab system.
 * The tab system calls mount() when switching to the MCP tab and
 * unmount() when switching away.
 */

import type { VSCodeAPI } from "../../../webview/types";
import { skeletonListHtml } from "../../../webview/loader";
import { initMcpApi, sendGetMcpServers } from "./api";
import { setServers, setSelectedServer, getSelectedServer, setLoading } from "./state";
import { renderMcpList } from "./views/listView";
import { showMcpDetail } from "./views/detailView";
import type { McpServer } from "../types";

let _container: HTMLElement | null = null;
let _messageHandler: ((event: MessageEvent) => void) | null = null;

/**
 * Mount the MCP servers view into the given container.
 * Initializes the API, sends a request for servers, and sets up
 * a message listener for incoming data.
 *
 * @param container - The DOM element to render the MCP view into
 */
export function mount(container: HTMLElement): void {
  _container = container;
  container.innerHTML = skeletonListHtml("Loading MCP servers…");

  // Set up message listener for MCP data
  _messageHandler = (event: MessageEvent) => {
    const msg = event.data as Record<string, unknown>;

    if (msg.type === "mcpServers") {
      const servers = msg.data as McpServer[];
      setServers(servers);
      setLoading(false);
      // If detail view is open, refresh the selected server with updated data
      const selected = getSelectedServer();
      if (selected && _container) {
        const updated = servers.find((s) => s.name === selected.name && s.scope === selected.scope);
        if (updated) {
          setSelectedServer(updated);
          showMcpDetail(_container);
        } else {
          renderMcpList(_container);
        }
      } else if (_container) {
        renderMcpList(_container);
      }
    } else if (msg.type === "mcpError") {
      setLoading(false);
      if (_container) {
        _container.innerHTML = `<div class="empty">Error: ${msg.message}</div>`;
      }
    }
  };

  window.addEventListener("message", _messageHandler);

  // Request MCP servers from the extension host
  setLoading(true);
  sendGetMcpServers();
}

/**
 * Unmount the MCP servers view and clean up event listeners.
 * Called when switching away from the MCP tab.
 */
export function unmount(): void {
  if (_messageHandler) {
    window.removeEventListener("message", _messageHandler);
    _messageHandler = null;
  }
  setSelectedServer(null);
  _container = null;
}

/**
 * Initialize the MCP tab with the VS Code API instance.
 * Must be called once before mount().
 *
 * @param vscode - The VS Code API instance from acquireVsCodeApi()
 */
export function initMcpTab(vscode: VSCodeAPI): void {
  initMcpApi(vscode);
}
