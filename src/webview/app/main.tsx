/**
 * Webview entry. Acquires the VS Code API exactly once, wires the message bus,
 * and renders the Preact App into the host-provided #root container.
 */
import { render } from "preact";
import { initPersistence } from "../persistence";
import { setVscodeApi } from "../shared/hooks";
import {
  activeTab,
  applyShellSettings,
  initMessageBus,
  getErrorLog,
  registerFeatureHandler,
  setErrorSink,
  startNowTicker,
} from "../shared/model";
import { noteAck } from "../shared/model/hostBusy";
import { App } from "./App";
import { installCrashSurface } from "./crashSurface";
import { installViewportGuard } from "./viewportGuard";

declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
};

// Installed FIRST, so a failure in any of the wiring below is still reported
// on screen rather than leaving an empty panel.
installCrashSurface();
// The app is one viewport tall and scrolls internally; a scrolled document
// would slide it off screen with no way back. See viewportGuard.ts.
installViewportGuard();

const vscode = acquireVsCodeApi();
setVscodeApi(vscode);
// Wire the setState/getState-backed persistence bridge so any feature that
// reads/writes view state via getPersisted/setPersisted survives a webview
// reload. Without this the helpers no-op (their handle stays null) and all
// UI state is session-only — see persistence.ts and the account signals note.
initPersistence(vscode);
initMessageBus();
// Host acks clear the shared busy indicator armed by useApi's post().
registerFeatureHandler("ack", noteAck);
// Shell-wide chrome from the host's settings push (currently row density).
// Registered here rather than in a feature because it skins every tab, and
// the host re-pushes `settings` on every configuration change, so the panel
// re-skins live without a reload.
registerFeatureHandler("settings", applyShellSettings);
// Mirror every webview failure to the host, where it lands in Output →
// Claude Code Manager and survives the panel. The panel's own console is
// behind a command most users have never run.
setErrorSink((entry) => {
  vscode.postMessage({
    type: "webviewError",
    source: entry.source,
    message: entry.message,
    stack: entry.stack,
  });
});
// Answer the host's liveness ping with what this document actually holds.
// A blank panel that still answers is a rendering bug; a blank panel that
// answers nothing is a dead webview. The host logs whichever it gets, so the
// difference survives in the log instead of being guessed at afterwards.
registerFeatureHandler("ping", (msg) => {
  const root = document.getElementById("root");
  vscode.postMessage({
    type: "pong",
    id: (msg as { id: number }).id,
    tabs: document.querySelectorAll(".tab-btn").length,
    rootLength: root?.innerHTML.length ?? 0,
    activeTab: activeTab.value,
    errors: getErrorLog().length,
    details: describeViewport(root),
  });
});

/**
 * Geometry and paint-affecting styles of the panel, as one compact line.
 *
 * A panel can hold a full DOM and still show nothing: a zero-height frame, a
 * collapsed root, a hidden body, an overlay on top. Those look identical from
 * the host (and identical to the user: "it went blank"), so the census
 * carries what tells them apart.
 */
function describeViewport(root: HTMLElement | null): string {
  const rect = root?.getBoundingClientRect();
  const rootStyle = root ? getComputedStyle(root) : undefined;
  const bodyStyle = getComputedStyle(document.body);
  const shell = document.querySelector(".app-shell");
  const shellRect = shell?.getBoundingClientRect();
  const overlay = document.querySelector(".modal, .modal-backdrop, #crash-surface");
  return [
    `win=${window.innerWidth}x${window.innerHeight}`,
    `docEl=${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
    `root=${Math.round(rect?.width ?? -1)}x${Math.round(rect?.height ?? -1)}@${Math.round(rect?.x ?? -1)},${Math.round(rect?.y ?? -1)}`,
    `rootStyle=${rootStyle?.display ?? "-"}/${rootStyle?.visibility ?? "-"}/${rootStyle?.opacity ?? "-"}`,
    `shell=${Math.round(shellRect?.width ?? -1)}x${Math.round(shellRect?.height ?? -1)}`,
    `body=${bodyStyle.display}/${bodyStyle.visibility}/${bodyStyle.overflow}`,
    `bg=${bodyStyle.backgroundColor}`,
    `overlay=${overlay ? overlay.className || overlay.id : "none"}`,
    `visibility=${document.visibilityState}`,
    `scroll=${window.scrollX},${window.scrollY}`,
  ].join(" ");
}

// Drive the shared wall-clock signal so relative timestamps + quota
// countdowns stay live without per-view timers.
startNowTicker();

const root = document.getElementById("root");
if (root) render(<App />, root);
