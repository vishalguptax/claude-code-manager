/**
 * Agent detail view: full configuration and system prompt for the selected
 * agent, with a back action and an "open file" action that delegates to the
 * host. Renders nothing useful if no agent is selected (parent guards this).
 */
import { Button } from "../../../../webview/components/Button";
import { Icon } from "../../../../webview/components/Icon";
import type { Agent } from "../../types";
import { ModelBadge } from "../components/ModelBadge";

export interface AgentDetailViewProps {
  agent: Agent;
  onBack: () => void;
  onOpenFile: (path: string) => void;
}

/** Strip leading YAML frontmatter from raw agent content to show the body. */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}

export function AgentDetailView({ agent, onBack, onOpenFile }: AgentDetailViewProps) {
  const body = stripFrontmatter(agent.content);

  return (
    <div class="panel">
      <button type="button" class="back-btn" onClick={onBack}>
        <Icon name="arrow-left" /> Back
      </button>

      <div class="agent-detail-head">
        <div class="agent-detail-title">{agent.name}</div>
        <ModelBadge model={agent.model} />
      </div>

      {agent.description ? <div class="agent-detail-desc">{agent.description}</div> : null}

      <div class="agent-detail-actions">
        <Button onClick={() => onOpenFile(agent.path)}>
          <Icon name="external-link" /> Open File
        </Button>
      </div>

      <div class="agent-detail-path">
        <span class="text-sm text-muted">{agent.path}</span>
      </div>

      {body ? (
        <div class="agent-detail-content">
          <div class="agent-detail-label">System Prompt</div>
          <pre class="agent-detail-pre">{body}</pre>
        </div>
      ) : null}
    </div>
  );
}
