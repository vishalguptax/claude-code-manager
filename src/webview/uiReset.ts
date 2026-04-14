/**
 * Global cleanup of stale UI state when the webview iframe loses pointer or
 * focus. Solves a class of bugs caused by the VS Code webview iframe quirk:
 * when the cursor leaves the iframe (or focus shifts to a different VS Code
 * panel, or the user clicks outside the window entirely), the browser does
 * NOT fire mouseleave on inner elements. CSS `:hover`, "Copied!" timer
 * states, dropdowns, and context menus then stay stuck on the last hovered
 * item until the user explicitly clicks back into the panel.
 *
 * The fix runs once per blur / visibility-loss event:
 *  1. Force-recompute :hover on the deepest currently-hovered element by
 *     toggling its display (cheap reflow that resets the hit-test cache).
 *  2. Remove any open context menu portal.
 *  3. Hide any open dropdown menus.
 *  4. Strip transient flash classes ("copied", "is-active") that timers
 *     normally clear — the timer will still fire later as a no-op.
 *
 * This is a single global handler instead of per-feature blur listeners
 * so every feature inherits the cleanup automatically and we have one
 * place to debug iframe-quirk regressions.
 */

/**
 * Force the deepest currently-hovered element to drop its `:hover` state
 * by hiding it for one frame. CSS `:hover` is browser-controlled and can
 * only be reset via a hit-test recompute — toggling `display` triggers
 * exactly that without flickering anything else on the page.
 */
function clearStuckHover(): void {
  const hovered = document.querySelectorAll<HTMLElement>(":hover");
  if (hovered.length === 0) return;
  // querySelectorAll(":hover") returns the entire ancestor chain. Walk
  // from deepest to shallowest and reset the first non-root element —
  // resetting one leaf is enough because the chain is recomputed.
  for (let i = hovered.length - 1; i >= 0; i--) {
    const el = hovered[i];
    if (el === document.body || el === document.documentElement) continue;
    const orig = el.style.display;
    el.style.display = "none";
    // Read offsetHeight to force synchronous reflow.
    void el.offsetHeight;
    el.style.display = orig;
    break;
  }
}

/**
 * Close transient overlays that should never persist across focus loss.
 * Targets the well-known classnames used by the sessions/skills/etc tabs.
 */
function closeTransientOverlays(): void {
  // Right-click context menu (sessions tab)
  document.getElementById("ctxMenu")?.remove();

  // Project dropdown menu (sessions tab) — uses .hidden to hide
  document
    .querySelectorAll<HTMLElement>(".dropdown-menu:not(.hidden)")
    .forEach((el) => el.classList.add("hidden"));

  // "Copied!" flash on per-item copy buttons — the inflight setTimeout
  // will still fire later but its remove() becomes a no-op once we strip
  // the class here.
  document.querySelectorAll<HTMLElement>(".copied").forEach((el) => el.classList.remove("copied"));
}

let installed = false;

/**
 * Install the global blur + visibility-change handlers. Idempotent; safe to
 * call from the webview bootstrap once per page load.
 */
export function installUiResetHandlers(): void {
  if (installed) return;
  installed = true;

  const handle = (): void => {
    clearStuckHover();
    closeTransientOverlays();
  };

  // window.blur fires when the user clicks outside the VS Code window or
  // focuses a different application.
  window.addEventListener("blur", handle);

  // visibilitychange covers the case where VS Code itself is still focused
  // but the user switched to a different VS Code panel/tab/editor — the
  // iframe becomes hidden but window.blur does not fire.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") handle();
  });
}
