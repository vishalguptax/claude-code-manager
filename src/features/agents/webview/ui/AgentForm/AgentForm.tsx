/**
 * Create/edit form for an agent, rendered as a full inline panel (not a
 * modal — a centered dialog is cramped in a ~350px sidebar and stacks a
 * popup behind its own backdrop). Emits an `AgentInput` on save; the
 * parent posts createAgent/updateAgent. Fields mirror the frontmatter the
 * parser reads (name, description, model, tools, skills) plus the
 * system-prompt body. tools/skills are entered free-text (comma or newline
 * separated) and split on save.
 */
import { useState } from "preact/hooks";
import { Button, Dropdown, TextArea, TextField } from "../../../../../webview/shared/ui";
import type { AgentInput } from "../../../../../shared/protocol/messages";
import type { Agent } from "../../../types";

export interface AgentFormProps {
  /** The agent being edited, or null to create a new one. */
  agent: Agent | null;
  onClose: () => void;
  onSubmit: (input: AgentInput) => void;
}

const MODEL_CHOICES = ["inherit", "sonnet", "opus", "haiku"];
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Split a comma/newline-separated list into trimmed, non-empty items. */
function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function AgentForm({ agent, onClose, onSubmit }: AgentFormProps) {
  const isEdit = agent !== null;
  const initialModel = agent?.model ?? "inherit";
  // A full model id (not one of the known short names) edits as "custom".
  const knownModel = MODEL_CHOICES.includes(initialModel);

  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [modelChoice, setModelChoice] = useState(knownModel ? initialModel : "custom");
  const [customModel, setCustomModel] = useState(knownModel ? "" : initialModel);
  const [tools, setTools] = useState((agent?.tools ?? []).join(", "));
  const [skills, setSkills] = useState((agent?.skills ?? []).join(", "));
  const [scope, setScope] = useState(agent?.scope === "project" ? "project" : "global");
  const [body, setBody] = useState(agentBody(agent));

  const nameValid = NAME_RE.test(name);
  const canSave = nameValid && (modelChoice !== "custom" || customModel.trim().length > 0);

  const submit = (): void => {
    if (!canSave) return;
    const model = modelChoice === "custom" ? customModel.trim() : modelChoice;
    onSubmit({
      scope: isEdit ? (agent as Agent).scope : scope,
      name: name.trim(),
      description: description.trim(),
      model,
      tools: splitList(tools),
      skills: splitList(skills),
      body,
    });
  };

  return (
    <div class="panel">
      <Button class="back-btn" iconName="arrow-left" onClick={onClose}>
        Back
      </Button>
      <div class="agent-form-title">{isEdit ? "Edit agent" : "New agent"}</div>
      <div class="agent-form">
        <label class="agent-form-field">
          <span class="agent-form-label">Name</span>
          <TextField
            value={name}
            onInput={setName}
            placeholder="lowercase-with-hyphens"
            ariaLabel="Agent name"
          />
          {name.length > 0 && !nameValid ? (
            <span class="agent-form-hint agent-form-hint-error">
              Lowercase letters, digits, and hyphens only.
            </span>
          ) : null}
        </label>

        {!isEdit ? (
          <label class="agent-form-field">
            <span class="agent-form-label">Scope</span>
            <Dropdown
              value={scope}
              onChange={setScope}
              ariaLabel="Agent scope"
              options={[
                { value: "global", label: "Global (~/.claude/agents)" },
                { value: "project", label: "Project (.claude/agents)" },
              ]}
            />
          </label>
        ) : null}

        <label class="agent-form-field">
          <span class="agent-form-label">Description</span>
          <TextArea
            value={description}
            onInput={setDescription}
            rows={2}
            placeholder="When should Claude delegate to this agent?"
            ariaLabel="Agent description"
          />
        </label>

        <label class="agent-form-field">
          <span class="agent-form-label">Model</span>
          <Dropdown
            value={modelChoice}
            onChange={setModelChoice}
            ariaLabel="Agent model"
            options={[
              { value: "inherit", label: "Inherit (main conversation)" },
              { value: "sonnet", label: "Sonnet" },
              { value: "opus", label: "Opus" },
              { value: "haiku", label: "Haiku" },
              { value: "custom", label: "Custom model id…" },
            ]}
          />
          {modelChoice === "custom" ? (
            <TextField
              value={customModel}
              onInput={setCustomModel}
              placeholder="e.g. claude-opus-4-8"
              ariaLabel="Custom model id"
            />
          ) : null}
        </label>

        <label class="agent-form-field">
          <span class="agent-form-label">Tools</span>
          <TextField
            value={tools}
            onInput={setTools}
            placeholder="Read, Grep, Bash (blank = inherit all)"
            ariaLabel="Agent tools"
          />
        </label>

        <label class="agent-form-field">
          <span class="agent-form-label">Skills</span>
          <TextField
            value={skills}
            onInput={setSkills}
            placeholder="comma-separated skill names"
            ariaLabel="Agent skills"
          />
        </label>

        <label class="agent-form-field">
          <span class="agent-form-label">System prompt</span>
          <TextArea
            value={body}
            onInput={setBody}
            rows={8}
            placeholder="You are…"
            ariaLabel="Agent system prompt"
          />
        </label>

        <div class="agent-form-actions">
          <Button variant="primary" iconName="check" disabled={!canSave} onClick={submit}>
            {isEdit ? "Save" : "Create"}
          </Button>
          <Button iconName="x" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Extract just the markdown body (after the frontmatter fence) for editing. */
function agentBody(agent: Agent | null): string {
  if (!agent) return "";
  const match = agent.content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[1] : agent.content;
}
