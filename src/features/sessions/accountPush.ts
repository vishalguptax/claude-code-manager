/**
 * Single choke point for pushing `accountData` to the webview, with
 * optional content-dedupe for the high-frequency watcher path.
 *
 * Why dedupe exists: during an active Claude session the account
 * payload is re-parsed and re-pushed from the file watchers every
 * 200ms-10s. The webview re-renders the whole Account panel (heatmap,
 * donut, breakdowns) on every message, so a no-op re-push costs a full
 * client-side recompute. Comparing the serialized payload host-side
 * kills those for the price of one JSON.stringify.
 *
 * Why dedupe is OPT-IN, not automatic: the Account and Config tabs both
 * request `getAccountData` and consume the same `accountData` reply, and
 * with keep-alive tabs both stay mounted behind one long-lived webview.
 * If Account mounts first (body X) and Config mounts later and requests,
 * an unconditional dedupe would see "body still X" and drop Config's
 * reply — leaving its skeleton stuck until the next content change. So a
 * push made in RESPONSE to an explicit request must always be delivered
 * (`dedupe` defaults to false); only the unsolicited watcher pushes pass
 * `dedupe: true`. Either way `lastPushed` is updated, so a watcher push
 * right after a solicited one still dedupes correctly.
 *
 * Keyed per Webview (WeakMap) so a panel remount resets the state.
 */
import type * as vscode from "vscode";
import type { AccountData } from "../account/types";

const lastPushed = new WeakMap<vscode.Webview, string>();

export function postAccountData(
  wv: vscode.Webview,
  data: AccountData,
  dedupe = false,
): void {
  const body = JSON.stringify(data);
  if (dedupe && lastPushed.get(wv) === body) return;
  lastPushed.set(wv, body);
  void wv.postMessage({ type: "accountData", data });
}
