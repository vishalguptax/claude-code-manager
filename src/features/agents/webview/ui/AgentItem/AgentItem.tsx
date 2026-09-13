/**
 * A single agent row in the list. Shows the name, a model badge, and a
 * truncated description. Selection state is reflected via the shared
 * `ListItem` primitive.
 */
import { ListItem } from "../../../../../webview/shared/ui";
import type { Agent } from "../../../types";
import { ModelBadge } from "../ModelBadge";

export interface AgentItemProps {
  agent: Agent;
  active: boolean;
  onSelect: (agent: Agent) => void;
}

export function AgentItem({ agent, active, onSelect }: AgentItemProps) {
  // Full description: `.agent-item-desc` ellipsizes it at the row's real edge,
  // so cutting at a fixed character count here only truncated it twice.
  const desc = agent.description;

  // An agent with no description is a real problem: Claude uses the
  // description to decide when to delegate, so a blank one is effectively
  // undiscoverable. Flag it with an amber validity dot.
  const missingDescription = agent.description.trim().length === 0;

  return (
    <ListItem class="agent-item" active={active} onClick={() => onSelect(agent)}>
      <div class="agent-item-row1">
        {missingDescription ? (
          <span
            class="agent-validity-dot"
            role="img"
            title="No description — Claude can't tell when to use this agent"
            aria-label="Warning: no description — Claude can't tell when to use this agent"
          />
        ) : null}
        <span class="agent-item-name">{agent.name}</span>
        <ModelBadge model={agent.model} />
      </div>
      {desc ? <div class="agent-item-desc" title={desc}>{desc}</div> : null}
    </ListItem>
  );
}
