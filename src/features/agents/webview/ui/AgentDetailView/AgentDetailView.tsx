/**
 * Agent detail view: full configuration and system prompt for the selected
 * agent, with a back action and an "open file" action that delegates to the
 * host. Renders nothing useful if no agent is selected (parent guards this).
 */
import { Badge, Button } from "../../../../../webview/shared/ui";
import type { Agent } from "../../../types";
import { stripFrontmatter } from "../../lib";
import { ModelBadge } from "../ModelBadge";

/** Read-only chip row for a frontmatter list field (tools / skills). */
function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div class="agent-detail-chips">
      <span class="agent-detail-label">{label}</span>
      <span class="agent-chip-list">
        {items.map((item) => (
          <Badge key={item} text={item} variant="scope" class="agent-chip" />
        ))}
      </span>
    </div>
  );
}

export interface AgentDetailViewProps {
  agent: Agent;
  onBack: () => void;
  onOpenFile: (path: string) => void;
  onEdit: (agent: Agent) => void;
  onDuplicate: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}

export function AgentDetailView({
  agent,
  onBack,
  onOpenFile,
  onEdit,
  onDuplicate,
  onDelete,
}: AgentDetailViewProps) {
  const body = stripFrontmatter(agent.content);
  // Plugin agents live in a plugin's install dir — read-only from here
  // (managed via Claude Code's /plugin), so no edit/delete/duplicate.
  const isPlugin = agent.scope === "plugin";

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

      {agent.tools && agent.tools.length > 0 ? (
        <ChipRow label="Tools" items={agent.tools} />
      ) : null}
      {agent.skills && agent.skills.length > 0 ? (
        <ChipRow label="Skills" items={agent.skills} />
      ) : null}

      <div class="agent-detail-actions">
        {!isPlugin ? (
          <Button variant="primary" iconName="pencil" onClick={() => onEdit(agent)}>
            Edit
          </Button>
        ) : null}
        <Button iconName="external-link" onClick={() => onOpenFile(agent.path)}>
          Open File
        </Button>
        {!isPlugin ? (
          <Button iconName="copy" onClick={() => onDuplicate(agent)}>
            Duplicate
          </Button>
        ) : null}
        {!isPlugin ? (
          <Button variant="danger" iconName="trash-2" onClick={() => onDelete(agent)}>
            Delete
          </Button>
        ) : (
          <span class="agent-readonly-note">
            Owned by plugin {agent.pluginName ?? ""} — managed via Claude Code's <code>/plugin</code>.
          </span>
        )}
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
