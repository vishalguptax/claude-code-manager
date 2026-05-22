/**
 * A single agent row in the list. Shows the name, a model badge, and a
 * truncated description. Selection state is reflected via the shared
 * `ListItem` primitive.
 */
import { ListItem } from "../../../../webview/shared/ui";
import type { Agent } from "../../types";
import { ModelBadge } from "./ModelBadge";

/** Maximum description characters before truncation. */
const DESC_MAX = 80;

export interface AgentItemProps {
  agent: Agent;
  active: boolean;
  onSelect: (agent: Agent) => void;
}

export function AgentItem({ agent, active, onSelect }: AgentItemProps) {
  const desc =
    agent.description.length > DESC_MAX
      ? `${agent.description.slice(0, DESC_MAX)}...`
      : agent.description;

  return (
    <ListItem class="agent-item" active={active} onClick={() => onSelect(agent)}>
      <div class="agent-item-row1">
        <span class="agent-item-name">{agent.name}</span>
        <ModelBadge model={agent.model} />
      </div>
      {desc ? <div class="agent-item-desc">{desc}</div> : null}
    </ListItem>
  );
}
