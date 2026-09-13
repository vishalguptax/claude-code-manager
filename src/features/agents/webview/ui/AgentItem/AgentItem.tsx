/**
 * A single agent row in the list: name, model, description, and the tools the
 * agent is allowed to use. Selection state comes from the shared `ListItem`.
 */
import { Badge, ListItem } from "../../../../../webview/shared/ui";
import type { Agent } from "../../../types";
import { ModelBadge } from "../ModelBadge";

/**
 * Tool chips shown before the row folds the rest into a count. Four fits one
 * line at the narrow end of the sidebar; a fifth wraps and turns a one-line
 * row into two, which is a poor trade for one more tool name.
 */
const TOOLS_SHOWN = 4;

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

  // Which tools an agent holds is the second thing you want to know about it,
  // and it used to require opening the detail view. An agent with no `tools`
  // in its frontmatter inherits the full set, which is the unremarkable
  // default and so shows nothing rather than a chip saying "everything".
  const tools = agent.tools ?? [];

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
      {tools.length > 0 ? (
        <div class="agent-item-tools" title={`Tools: ${tools.join(", ")}`}>
          {tools.slice(0, TOOLS_SHOWN).map((tool) => (
            <Badge key={tool} text={tool} variant="default" />
          ))}
          {tools.length > TOOLS_SHOWN ? (
            <Badge text={`+${tools.length - TOOLS_SHOWN}`} variant="default" />
          ) : null}
        </div>
      ) : null}
    </ListItem>
  );
}
