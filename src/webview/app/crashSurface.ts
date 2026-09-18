/**
 * Last-resort visible error reporting for the webview.
 *
 * The <ErrorBoundary> covers exceptions thrown inside the Preact tree. An
 * exception raised anywhere else — a host-message handler, an async callback,
 * a rejected promise, or the module's own top-level code — escapes it, and a
 * webview has no visible console: the panel simply goes blank and the user has
 * no way to know why short of knowing that "Developer: Open Webview Developer
 * Tools" exists. This paints the failure into the panel instead, with the
 * detail selectable and a one-click route into the bug report.
 *
 * Deliberately DOM-level rather than a Preact component: it has to work when
 * the Preact tree is exactly what failed.
 */
import { postToHost } from "../shared/hooks";
import { formatErrorLog, getErrorLog, recordError } from "../shared/model";

const BANNER_ID = "crash-surface";

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "btn crash-surface-action";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

function show(): void {
  // First failure wins: a crash usually triggers a cascade, and replacing the
  // banner on each one would leave the least informative message on screen.
  // Later entries are still in the log the report is built from.
  if (document.getElementById(BANNER_ID)) return;

  const el = document.createElement("div");
  el.id = BANNER_ID;
  el.className = "crash-surface";
  el.setAttribute("role", "alert");

  const title = document.createElement("div");
  title.className = "crash-surface-title";
  title.textContent = "The panel hit an error";

  const detail = document.createElement("pre");
  detail.className = "crash-surface-detail";
  detail.textContent = formatErrorLog(getErrorLog());

  const actions = document.createElement("div");
  actions.className = "crash-surface-actions";
  actions.append(
    // Recovery first: a full reload re-mounts the app from a fresh document,
    // which is what the user actually wants from a broken panel and what they
    // would otherwise reach by reloading the whole VS Code window.
    button("Reload panel", () => postToHost({ type: "reloadAll" })),
    button("Report problem", () => postToHost({ type: "reportIssue" })),
    button("Dismiss", () => el.remove()),
  );

  el.append(title, detail, actions);
  document.body.appendChild(el);
}

/**
 * Register the global handlers. Returns a teardown, used by tests — the real
 * webview installs this for the life of the document.
 */
export function installCrashSurface(): () => void {
  const onError = (e: ErrorEvent): void => {
    // A failed <script>/<link> fires an error event at the ELEMENT with no
    // `error` object — the whole failure is the target's URL. That is exactly
    // how a feature chunk that 404s or trips the CSP shows up, and it is the
    // one crash that leaves nothing else behind to log.
    const target = e.target as (HTMLElement & { src?: string; href?: string }) | null;
    if (target && target !== (window as unknown as EventTarget) && (target.src || target.href)) {
      recordError("resource", `Failed to load ${target.src ?? target.href}`);
    } else {
      recordError("window", e.error ?? e.message);
    }
    show();
  };
  const onRejection = (e: PromiseRejectionEvent): void => {
    recordError("promise", e.reason);
    show();
  };
  // Capture phase: resource errors do not bubble, so a bubble-phase listener
  // never sees the chunk that failed to load.
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
