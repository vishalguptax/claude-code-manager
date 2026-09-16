/**
 * Secondary-sidebar placement gate.
 *
 * VS Code 1.106 introduced the `viewsContainers.secondarySidebar`
 * contribution point. Our `engines.vscode` floor stays at ^1.90.0, so
 * the manifest contributes the view container TWICE — once under
 * `activitybar`, once under `secondarySidebar` — and the two entries
 * carry mutually exclusive `when` clauses keyed on
 * `claudeCodeManager:doesNotSupportSecondarySidebar`.
 *
 * Polarity is load-bearing: the context key is set to true ONLY on
 * hosts older than 1.106 and stays unset (falsy) everywhere else. A
 * host that predates our activation code — or one where the version
 * string is unparseable — therefore falls back to the activity bar,
 * which every supported VS Code understands. Inverting it would show
 * two copies of the panel on new hosts and none on old ones.
 */

/** View id contributed into the activity-bar container (pre-1.106 hosts). */
export const ACTIVITY_BAR_VIEW_ID = "claudeCodeManager.view";

/** View id contributed into the secondary sidebar (1.106+ hosts). */
export const SECONDARY_SIDEBAR_VIEW_ID = "claudeCodeManager.secondaryView";

/** Context key consulted by the manifest's `when` clauses. */
export const NO_SECONDARY_SIDEBAR_CONTEXT_KEY =
  "claudeCodeManager:doesNotSupportSecondarySidebar";

/**
 * True when `version` is VS Code 1.106 or newer — the first release
 * that understands `viewsContainers.secondarySidebar`.
 *
 * Only the major and minor segments are compared; `vscode.version`
 * carries suffixes on the patch segment for pre-release builds
 * ("1.96.0-insider"), which say nothing about API availability.
 *
 * Anything we cannot parse with confidence — undefined, empty, a single
 * segment, a non-numeric segment — returns false, the safe answer: the
 * caller then keeps the extension in the activity bar rather than
 * betting the panel's visibility on a guess.
 */
export function supportsSecondarySidebar(version: string | undefined): boolean {
  if (typeof version !== "string") return false;
  const [rawMajor, rawMinor] = version.split(".");
  if (!/^\d+$/.test(rawMajor ?? "") || !/^\d+$/.test(rawMinor ?? "")) return false;
  const major = Number(rawMajor);
  const minor = Number(rawMinor);
  return major > 1 || (major === 1 && minor >= 106);
}
