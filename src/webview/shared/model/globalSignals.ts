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
 * `claudeManager.hiddenTabs` / `claudeManager.tabOrder`, mirrored from the
 * host. Read by `app/tabs/lib/visibleTabs.ts`'s computed rather than here —
 * this module is generic shell state and must not import the tab registry,
 * which is app-specific.
 *
 * Both default to empty, matching the settings' own defaults: no host
 * handshake yet means no preference yet, which the resolver already treats
 * as "show everything, in the registry's own order".
 */
export const hiddenTabsPref = signal<string[]>([]);
export const tabOrderPref = signal<string[]>([]);

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
  const raw = msg as { density?: unknown; hiddenTabs?: unknown; tabOrder?: unknown };
  density.value = raw.density === "quiet" ? "quiet" : "comfortable";
  hiddenTabsPref.value = stringArray(raw.hiddenTabs);
  tabOrderPref.value = stringArray(raw.tabOrder);
}

/**
 * A settings.json array can hold anything — VS Code validates against the
 * manifest's `enum`, but only in its own UI, not in the raw JSON a user can
 * still hand-edit. Keep only string entries rather than trusting the shape,
 * so a stray number or object in the array degrades to "ignore that one
 * entry" instead of corrupting the whole ordering pass.
 */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
