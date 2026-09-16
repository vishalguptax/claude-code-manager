/**
 * Where the host posts messages when the panel may exist more than once.
 *
 * Claude Manager contributes its container to both the activity bar and
 * the secondary sidebar, so the user can open it from either side — and
 * can have both open at the same time. The host side of the extension is
 * deliberately NOT duplicated for that: one provider, one session cache,
 * one watcher fleet. Only the webview (its DOM and its signals) exists
 * per panel, which is what makes two panels useful rather than wasteful —
 * each keeps its own tab, scroll position and filters.
 *
 * Every consumer of `getWebview()` calls exactly one method on the result,
 * `postMessage`. Typing the accessor as this narrow sink rather than the
 * full `vscode.Webview` is what let the panel become multi-view without
 * touching the ~86 call sites that post through it: a single `Webview`
 * satisfies `PanelSink` structurally, and so does a fan-out over several.
 */

/** The one capability the host needs from a panel: send it a message. */
export interface PanelSink {
  postMessage(message: unknown): PromiseLike<boolean>;
}

/**
 * Fan one message out to every live panel.
 *
 * Resolves true when at least one panel accepted it, matching
 * `Webview.postMessage`'s contract closely enough for the callers that
 * bother to await it (a false there means "nobody received this").
 *
 * A panel that throws — disposed between the visibility check and the
 * post, which is a real race on window close — is skipped rather than
 * failing the whole broadcast. One dead panel must not silence the other.
 */
export function broadcastSink(sinks: readonly PanelSink[]): PanelSink {
  return {
    async postMessage(message: unknown): Promise<boolean> {
      const results = await Promise.all(
        sinks.map(async (sink) => {
          try {
            return await sink.postMessage(message);
          } catch {
            return false;
          }
        }),
      );
      return results.some(Boolean);
    },
  };
}
