/**
 * Where the panel lives: activity bar or secondary sidebar.
 *
 * VS Code 1.106 introduced the `viewsContainers.secondarySidebar`
 * contribution point. Our `engines.vscode` floor stays at ^1.90.0, so the
 * manifest contributes the view container TWICE — once under
 * `activitybar`, once under `secondarySidebar` — with mutually exclusive
 * `when` clauses keyed on {@link USE_SECONDARY_SIDEBAR_CONTEXT_KEY}.
 *
 * The two entries are mutually exclusive on purpose: contributing both at
 * once puts two independent copies of the panel on screen, each with its
 * own webview, its own watchers and its own state. Which ONE is shown is
 * the user's choice, via `claudeManager.placement` — this is a preference,
 * not a capability check, so a host that supports both must not have the
 * placement decided for it.
 *
 * Polarity is load-bearing. The context key is set true only to move the
 * panel to the secondary sidebar; unset (falsy) means the activity bar,
 * which every supported VS Code understands. So an old host, an
 * unparseable version, or activation code that has not run yet all land
 * on the activity bar — the historical placement — rather than nowhere.
 */

/** Setting that chooses the placement. */
export const PLACEMENT_SETTING = "placement";

/** Accepted values for {@link PLACEMENT_SETTING}. */
export type Placement = "activityBar" | "secondarySidebar";

/** Placement used when the setting is unset or unrecognised. */
export const DEFAULT_PLACEMENT: Placement = "activityBar";

/** View id contributed into the activity-bar container. */
export const ACTIVITY_BAR_VIEW_ID = "claudeCodeManager.view";

/** View id contributed into the secondary-sidebar container. */
export const SECONDARY_SIDEBAR_VIEW_ID = "claudeCodeManager.secondaryView";

/** Context key consulted by the manifest's `when` clauses. */
export const USE_SECONDARY_SIDEBAR_CONTEXT_KEY = "claudeCodeManager:useSecondarySidebar";

/**
 * True when `version` is VS Code 1.106 or newer — the first release that
 * understands `viewsContainers.secondarySidebar`.
 *
 * Only the major and minor segments are compared; `vscode.version` carries
 * suffixes on the patch segment for pre-release builds ("1.96.0-insider"),
 * which say nothing about API availability.
 *
 * Anything we cannot parse with confidence — undefined, empty, a single
 * segment, a non-numeric segment — returns false, the safe answer: the
 * caller then keeps the panel in the activity bar rather than betting its
 * visibility on a guess.
 */
export function supportsSecondarySidebar(version: string | undefined): boolean {
  if (typeof version !== "string") return false;
  const [rawMajor, rawMinor] = version.split(".");
  if (!/^\d+$/.test(rawMajor ?? "") || !/^\d+$/.test(rawMinor ?? "")) return false;
  const major = Number(rawMajor);
  const minor = Number(rawMinor);
  return major > 1 || (major === 1 && minor >= 106);
}

/** The resolved placement for this host and this user's preference. */
export interface ResolvedPlacement {
  /** Value to publish on {@link USE_SECONDARY_SIDEBAR_CONTEXT_KEY}. */
  useSecondarySidebar: boolean;
  /**
   * The view id that actually exists on screen. Both ids are registered,
   * but only the one whose `when` holds is ever resolved — focusing the
   * other is a silent no-op, which is what made this worth computing
   * rather than hardcoding.
   */
  viewId: string;
}

/**
 * Resolve where the panel goes.
 *
 * A request for the secondary sidebar on a host too old to render it
 * degrades to the activity bar rather than hiding the panel: the user
 * asked for a position, not for it to disappear. Any unrecognised setting
 * value degrades the same way.
 */
export function resolvePlacement(
  version: string | undefined,
  placement: string | undefined,
): ResolvedPlacement {
  const wantsSecondary = placement === "secondarySidebar";
  const useSecondarySidebar = wantsSecondary && supportsSecondarySidebar(version);
  return {
    useSecondarySidebar,
    viewId: useSecondarySidebar ? SECONDARY_SIDEBAR_VIEW_ID : ACTIVITY_BAR_VIEW_ID,
  };
}
