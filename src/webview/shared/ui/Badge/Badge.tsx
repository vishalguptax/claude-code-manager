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

export interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
  title?: string;
  class?: string;
}

export function Badge({ text, variant = "default", title, class: cls }: BadgeProps) {
  return (
    <span class={cx("vsc-badge", `vsc-badge--${variant}`, cls)} title={title}>
      {text}
    </span>
  );
}
