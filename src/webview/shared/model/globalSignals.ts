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
 * Host facts features gate on, mirrored from the `settings` message.
 *
 * Shell state rather than per-feature state for one reason: timing. The host
 * pushes `settings` once, in reply to the webview's `ready`, and again only
 * when configuration changes — but a tab registers its handlers when it
 * first mounts, which is the first time the user opens it. A handler inside
 * a feature therefore missed the startup push and kept its default until a
 * settings change happened to re-send it: Commands and Skills hid their
 * launch-in-chat actions, and a custom marketplace URL was ignored. The shell
 * handler is registered before `ready` is posted, so it never misses one.
 *
 * Defaults match the manifest's, so the first paint is right even before the
 * handshake lands.
 */
export const claudeCodeInstalled = signal<boolean>(false);
export const DEFAULT_SKILLS_MARKETPLACE_URL = "https://github.com/anthropics/claude-code/wiki/Skills";
export const DEFAULT_MCP_MARKETPLACE_URL = "https://mcp.so";
/** `claudeManager.marketplaceSkillsUrl` — the Skills tab's "Browse community skills". */
export const marketplaceSkillsUrl = signal<string>(DEFAULT_SKILLS_MARKETPLACE_URL);
/** `claudeManager.marketplaceMcpUrl` — the MCP catalog's "Find more servers". */
export const marketplaceMcpUrl = signal<string>(DEFAULT_MCP_MARKETPLACE_URL);

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
  const raw = msg as {
    density?: unknown;
    hiddenTabs?: unknown;
    tabOrder?: unknown;
    claudeCodeExtensionInstalled?: unknown;
    marketplaceSkillsUrl?: unknown;
    marketplaceMcpUrl?: unknown;
  };
  density.value = raw.density === "quiet" ? "quiet" : "comfortable";
  hiddenTabsPref.value = stringArray(raw.hiddenTabs);
  tabOrderPref.value = stringArray(raw.tabOrder);
  claudeCodeInstalled.value = raw.claudeCodeExtensionInstalled === true;
  marketplaceSkillsUrl.value = urlOr(raw.marketplaceSkillsUrl, DEFAULT_SKILLS_MARKETPLACE_URL);
  marketplaceMcpUrl.value = urlOr(raw.marketplaceMcpUrl, DEFAULT_MCP_MARKETPLACE_URL);
}

/** A non-empty string setting, else the default — a cleared field means "use the default". */
function urlOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
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
