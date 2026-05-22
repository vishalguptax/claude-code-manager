/**
 * Colored badge showing an agent's model. The model-specific class drives the
 * accent color in `agents.css`; unknown models fall back to neutral styling.
 */
import { cx } from "../../../../webview/utils/classnames";

/** Models that have a dedicated accent color in the stylesheet. */
const KNOWN_MODELS = new Set(["sonnet", "opus", "haiku"]);

export interface ModelBadgeProps {
  model: string;
}

export function ModelBadge({ model }: ModelBadgeProps) {
  const known = KNOWN_MODELS.has(model.toLowerCase());
  return (
    <span class={cx("agent-model-badge", known && `agent-model-${model.toLowerCase()}`)}>
      {model}
    </span>
  );
}
