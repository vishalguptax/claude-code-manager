/**
 * Badge — a small inline label chip. Generalises the per-feature scope/type/
 * count pills (mcp scope/type badges, command/skill scope badges, agent model
 * badge, list counts) into one primitive whose colour is chosen by `variant`.
 *
 * Variants:
 *   - "default" — neutral grey overlay (theme-agnostic, readable on any bg).
 *   - "count"   — VS Code's own --vscode-badge-* pair (matches tree/tab counts).
 *   - "scope"   — subtle scope tag (project/global etc.), neutral overlay.
 *   - "status"  — informational accent (blue).
 *   - "danger"  — error/destructive accent (red).
 *
 * All colour lives in CSS (`.vsc-badge` + `.vsc-badge--<variant>`); this stays
 * a pure presentational function with no theme logic.
 */
import { cx } from "../../lib";

export type BadgeVariant = "scope" | "count" | "status" | "danger" | "default";

/**
 * Where a thing is configured. Five features show this same chip — Skills,
 * Commands, Hooks, MCP and Agents — and all five agreed on the colours
 * (project green, global neutral, plugin purple) while each declared them
 * privately: `.scope-*`, `.cmd-scope-*`, `.hook-scope-*`, `.mcp-scope-*`, with
 * the commands plugin colour split off into a fifth file. Four copies of one
 * agreement is four chances to drift, so the map lives in one place now and the
 * features pass the scope instead of a class name.
 *
 * "local" is a project-scoped settings file that happens not to be committed,
 * so it shares the project colour rather than earning a sixth one.
 */
export type BadgeScope = "project" | "local" | "global" | "builtin" | "plugin";

export interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
  /**
   * Colour the chip by where the thing is configured. Implies the "scope"
   * variant, so a caller passes this instead of `variant`, not as well as it.
   */
  scope?: BadgeScope;
  title?: string;
  class?: string;
}

export function Badge({ text, variant = "default", scope, title, class: cls }: BadgeProps) {
  return (
    <span
      class={cx(
        "vsc-badge",
        `vsc-badge--${scope ? "scope" : variant}`,
        scope && `vsc-badge--scope-${scope}`,
        cls,
      )}
      title={title}
    >
      {text}
    </span>
  );
}
