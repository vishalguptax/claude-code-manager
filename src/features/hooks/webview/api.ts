/**
 * Typed postMessage helpers for the hooks webview. Each helper builds a
 * `WebviewMessage` variant from the shared protocol so a typo in the
 * `type` string or a missing field is a compile error, not a silent
 * runtime no-op. Callers obtain `post` from `useApi()`.
 */
import type { WebviewMessage, SettingsScope } from "../../../shared/protocol/messages";
import type { Hook } from "../types";

/** The bound postMessage function returned by `useApi()`. */
export type Post = (msg: WebviewMessage) => void;

/** Request the full hook list from the host. */
export function getHooks(post: Post): void {
  post({ type: "getHooks" });
}

/** Open a Claude settings.json file for the given editable scope. */
export function openSettingsFile(post: Post, scope: SettingsScope): void {
  post({ type: "openSettingsFile", scope });
}

/** Toggle a hook between the active and parked (`_disabled_hooks`) blocks. */
export function toggleHookEnabled(post: Post, hook: Hook): void {
  post({ type: "toggleHookEnabled", hook });
}

/** Delete a hook. The host shows a confirm modal before writing. */
export function deleteHook(post: Post, hook: Hook): void {
  post({ type: "deleteHook", hook });
}

/** Fields an edit can change (matcher/command always; event/scope/timeout optional). */
export interface HookEditFields {
  matcher: string;
  command: string;
  event?: string;
  scope?: SettingsScope;
  timeout?: number;
}

/** Apply an edit to an existing hook (matcher/command + optional event/scope/timeout). */
export function updateHook(post: Post, original: Hook, next: HookEditFields): void {
  post({ type: "updateHook", original, next });
}

/** Launch the host's native scope → event → matcher → command wizard. */
export function promptAddHook(post: Post): void {
  post({ type: "promptAddHook" });
}

/** Open the read-only /hooks panel in a terminal. */
export function openHooksPanel(post: Post): void {
  post({ type: "openHooksPanel" });
}
