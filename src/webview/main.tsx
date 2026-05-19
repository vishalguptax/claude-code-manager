/**
 * Webview entry. Acquires the VS Code API exactly once, wires the message bus,
 * and renders the Preact App into the host-provided #root container.
 */
import { render } from "preact";
import { App } from "./App";
import { setVscodeApi } from "./hooks/useApi";
import { initMessageBus } from "./signals/messageBus";

declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
};

const vscode = acquireVsCodeApi();
setVscodeApi(vscode);
initMessageBus();

const root = document.getElementById("root");
if (root) render(<App />, root);
