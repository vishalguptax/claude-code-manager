/**
 * Agent detail view: full configuration and system prompt for the selected
 * agent, with a back action and an "open file" action that delegates to the
 * host. Renders nothing useful if no agent is selected (parent guards this).
 */
import { Button } from "../../../../../webview/shared/ui";
import type { Agent } from "../../../types";
import { stripFrontmatter } from "../../lib";
import { ModelBadge } from "../ModelBadge";

export interface AgentDetailViewProps {
  agent: Agent;
  onBack: () => void;
  onOpenFile: (path: string) => void;
}

export function AgentDetailView({ agent, onBack, onOpenFile }: AgentDetailViewProps) {
  const body = stripFrontmatter(agent.content);

  return (
    <div class="panel">
      <Button class="back-btn" iconName="arrow-left" onClick={onBack}>
        Back
      </Button>

      <div class="agent-detail-head">
        <div class="agent-detail-title">{agent.name}</div>
        <ModelBadge model={agent.model} />
      </div>

      {agent.description ? <div class="agent-detail-desc">{agent.description}</div> : null}

      <div class="agent-detail-actions">
        <Button iconName="external-link" onClick={() => onOpenFile(agent.path)}>
          Open File
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
