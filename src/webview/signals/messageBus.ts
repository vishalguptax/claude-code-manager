/**
 * Host-to-webview message bus. Parses incoming `window.message` events with the
 * shared protocol parser, then fans out to per-prefix feature handlers.
 */
import { type Message, parseMessage } from "../../shared/protocol/schemas";

export type Handler = (msg: Message) => void;

const handlers = new Map<string, Handler[]>();

/**
 * Register a handler invoked for any message whose `type` begins with the given prefix.
 * Returns an unsubscribe function.
 */
export function registerFeatureHandler(typePrefix: string, h: Handler): () => void {
  const arr = handlers.get(typePrefix) ?? [];
  arr.push(h);
  handlers.set(typePrefix, arr);
  return () => {
    const cur = handlers.get(typePrefix);
    if (!cur) return;
    const idx = cur.indexOf(h);
    if (idx >= 0) cur.splice(idx, 1);
    if (cur.length === 0) handlers.delete(typePrefix);
  };
}

/**
 * Synchronously dispatch a parsed message to every matching registered handler.
 */
export function dispatch(msg: Message): void {
  for (const [prefix, list] of handlers) {
    if (msg.type.startsWith(prefix)) {
      for (const h of list) {
        try {
          h(msg);
        } catch (err) {
          console.error("[claude-manager] handler error", err);
        }
      }
    }
  }
}

/**
 * Reset all registered handlers. Test-only helper.
 */
export function _resetMessageBus(): void {
  handlers.clear();
}

/**
 * Install the global `message` event listener that drives the bus.
 */
export function initMessageBus(): void {
  window.addEventListener("message", (e: MessageEvent) => {
    try {
      const msg = parseMessage(e.data);
      dispatch(msg);
    } catch (err) {
      console.error("[claude-manager] invalid message", err);
    }
  });
}
