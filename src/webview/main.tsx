/**
 * Webview entry. Acquires the VS Code API exactly once, wires the message bus,
 * and renders the Preact App into the host-provided #root container.
 */
import { render } from "preact";
import { App } from "./App";
import { setVscodeApi } from "./hooks/useApi";
import { initPersistence } from "./persistence";
import { initMessageBus } from "./signals/messageBus";

declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
};

const vscode = acquireVsCodeApi();
setVscodeApi(vscode);
// Wire the setState/getState-backed persistence bridge so any feature that
// reads/writes view state via getPersisted/setPersisted survives a webview
// reload. Without this the helpers no-op (their handle stays null) and all
// UI state is session-only — see persistence.ts and the account signals note.
initPersistence(vscode);
initMessageBus();

const root = document.getElementById("root");
if (root) render(<App />, root);
