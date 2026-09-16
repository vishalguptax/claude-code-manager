/**
 * Both panel placements: activity bar and secondary sidebar.
 *
 * VS Code 1.106 introduced the `viewsContainers.secondarySidebar`
 * contribution point. Our `engines.vscode` floor stays at ^1.90.0, so the
 * container is contributed twice and the secondary entry is gated on
 * {@link SUPPORTS_SECONDARY_SIDEBAR_CONTEXT_KEY} — a capability check, not
 * a preference. On a capable host BOTH icons are present, and the user
 * opens the panel from whichever side they want.
 *
 * The activity-bar entry carries no `when` at all: it is the placement
 * every supported VS Code understands and the one this extension has
 * always shipped, so it must survive an unparseable version, an old host,
 * and activation code that has not run yet.
 *
 * Opening both at once is supported — the provider tracks a set of views
 * and broadcasts to them, so the host state (sessions, watchers, pollers)
 * stays single and only the webviews are per-panel. Users who want just
 * one icon hide the other through VS Code's own activity-bar context menu.
 */

/** View id contributed into the activity-bar container. */
export const ACTIVITY_BAR_VIEW_ID = "claudeCodeManager.view";

/** View id contributed into the secondary-sidebar container. */
export const SECONDARY_SIDEBAR_VIEW_ID = "claudeCodeManager.secondaryView";

/** Context key gating the secondary-sidebar contribution. */
export const SUPPORTS_SECONDARY_SIDEBAR_CONTEXT_KEY =
  "claudeCodeManager:supportsSecondarySidebar";

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
