/**
 * Colored badge showing an agent's model. Built on the shared `Badge`
 * primitive; the model-specific class (`agent-model-<model>`) drives the accent
 * color in `agents.css` for known models. Unknown models fall back to the
 * neutral default Badge styling.
 */
import { cx } from "../../../../../webview/shared/lib";
import { Badge } from "../../../../../webview/shared/ui";

/** Models that have a dedicated accent color in the stylesheet. */
const KNOWN_MODELS = new Set(["sonnet", "opus", "haiku"]);

export interface ModelBadgeProps {
  model: string;
}

export function ModelBadge({ model }: ModelBadgeProps) {
  const lower = model.toLowerCase();
  const known = KNOWN_MODELS.has(lower);
  return (
    <Badge text={model} class={cx("agent-model-badge", known && `agent-model-${lower}`)} />
  );
}
