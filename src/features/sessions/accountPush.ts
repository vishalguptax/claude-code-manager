/**
 * Single choke point for pushing `accountData` to the webview, with
 * content-dedupe: identical consecutive payloads are dropped.
 *
 * Why: the account payload is re-parsed and re-pushed from ~20 call
 * sites — every settings click, plus watcher fires every 200ms-10s
 * during an active Claude session. The webview re-renders the whole
 * Account panel (heatmap, donut, breakdowns) on every message it
 * receives, so a no-op re-push still costs a full client-side
 * recompute. Comparing the serialized payload host-side kills those
 * for the price of one JSON.stringify (~1ms) — far cheaper than the
 * serialize-transfer-parse-render it avoids.
 *
 * Keyed per Webview (WeakMap) so a panel remount naturally resets the
 * dedupe state and always receives its first push.
 */
import type * as vscode from "vscode";
import type { AccountData } from "../account/types";

const lastPushed = new WeakMap<vscode.Webview, string>();

export function postAccountData(wv: vscode.Webview, data: AccountData): void {
  const body = JSON.stringify(data);
  if (lastPushed.get(wv) === body) return;
  lastPushed.set(wv, body);
  void wv.postMessage({ type: "accountData", data });
}
