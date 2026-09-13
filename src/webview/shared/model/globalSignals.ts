/**
 * Application-wide reactive state shared across the Preact webview.
 */
import { signal } from "@preact/signals";
import type { Message } from "../../../shared/protocol/schemas";

export const activeTab = signal<string>("sessions");
export const ready = signal<boolean>(false);
export const theme = signal<"light" | "dark">("dark");

/**
 * How list rows are separated, from the `claudeManager.density` setting.
 *
 * "comfortable" rules every row off from the next; "quiet" drops the rules and
 * leaves whitespace plus the section headings to do the separating, the way VS
 * Code's own file tree does. App stamps this on its root wrapper as
 * `data-density`, and density.css hangs every override off that one attribute.
 */
export type Density = "comfortable" | "quiet";

/** The default matches the setting's default, so the first paint is not a flash
 *  of the wrong density while the host handshake is still in flight. */
export const density = signal<Density>("comfortable");

/**
 * Apply the host's `settings` payload to app-wide chrome. Registered in
 * main.tsx, because density is shell state rather than any one feature's —
 * features read their own keys off the same message in their own handlers.
 *
 * Unknown values fall back to "comfortable" rather than being stamped
 * verbatim: the attribute drives CSS, and an unrecognised value would select
 * nothing and silently render the comfortable layout anyway. Normalising here
 * keeps the signal's type honest for anything else that reads it.
 */
export function applyShellSettings(msg: Message): void {
  if (msg.type !== "settings") return;
  const next = (msg as { density?: unknown }).density;
  density.value = next === "quiet" ? "quiet" : "comfortable";
}
