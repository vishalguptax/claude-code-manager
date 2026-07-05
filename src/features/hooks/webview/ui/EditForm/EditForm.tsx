/**
 * Inline edit form for a command hook. Beyond matcher + command it can
 * re-home the hook to a different event or scope and set a per-command
 * timeout. Saving fires `onSave` (which posts `updateHook`); the host's
 * reply re-renders the detail surface via the regular `hooks` round-trip.
 * Save is disabled while the command is empty.
 *
 * The matcher is single-line (shared <TextField>); the command is
 * multi-line (shared <TextArea>). Event + scope use the shared
 * <Dropdown>; timeout is a small numeric <TextField>.
 */
import { useState } from "preact/hooks";
import { Button, Dropdown, Icon, TextArea, TextField } from "../../../../../webview/shared/ui";
import type { SettingsScope } from "../../../../../shared/protocol/messages";
import { KNOWN_HOOK_EVENTS, eventUsesMatcher } from "../../../events";
import type { Hook } from "../../../types";
import type { HookEditFields } from "../../api";

export interface EditFormProps {
  hook: Hook;
  onSave: (next: HookEditFields) => void;
  onCancel: () => void;
}

const EVENT_OPTIONS = KNOWN_HOOK_EVENTS.map((e) => ({ value: e.name, label: e.label }));
const SCOPE_OPTIONS: Array<{ value: SettingsScope; label: string }> = [
  { value: "global", label: "Global" },
  { value: "project", label: "Project" },
  { value: "local", label: "Local" },
];

/** Editable scopes only — plugin hooks never reach the edit form. */
function editableScope(scope: Hook["scope"]): SettingsScope {
  return scope === "plugin" ? "project" : scope;
}

export function EditForm({ hook, onSave, onCancel }: EditFormProps) {
  const [matcher, setMatcher] = useState(hook.matcher);
  const [command, setCommand] = useState(hook.command);
  const [event, setEvent] = useState(hook.event);
  const [scope, setScope] = useState<SettingsScope>(editableScope(hook.scope));
  const [timeout, setTimeout] = useState(hook.timeout !== undefined ? String(hook.timeout) : "");

  const trimmedCommand = command.trim();
  const trimmedTimeout = timeout.trim();
  // Timeout is optional, but if given it must be a positive integer (seconds).
  const timeoutValid = trimmedTimeout === "" || /^[1-9]\d*$/.test(trimmedTimeout);
  const canSave = trimmedCommand.length > 0 && timeoutValid;
  const usesMatcher = eventUsesMatcher(event);

  const save = (): void => {
    if (!canSave) return;
    onSave({
      // A matcher only means something for tool-matching events; re-homing to
      // SessionStart/Stop/etc. must not silently persist a stale tool pattern.
      matcher: usesMatcher ? matcher.trim() : "",
      command: trimmedCommand,
      event,
      scope,
      timeout: trimmedTimeout === "" ? undefined : Number(trimmedTimeout),
    });
  };

  return (
    <div class="d-section">
      <div class="d-label">Edit hook</div>

      <div class="hook-field">
        <span class="hook-field-label">Event</span>
        <Dropdown value={event} options={EVENT_OPTIONS} onChange={setEvent} ariaLabel="Event" />
      </div>

      <div class="hook-field">
        <span class="hook-field-label">Scope</span>
        <Dropdown
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={(v) => setScope(v as SettingsScope)}
          ariaLabel="Scope"
        />
      </div>

      {usesMatcher ? (
        <div class="hook-field">
          <span class="hook-field-label" id="hookEditMatcherLabel">
            Matcher
          </span>
          <TextField
            value={matcher}
            ariaLabel="Matcher"
            placeholder="Tool name or pattern (blank = match all)"
            onInput={setMatcher}
          />
        </div>
      ) : null}

      <div class="hook-field">
        <span class="hook-field-label">Timeout (seconds)</span>
        <TextField
          value={timeout}
          ariaLabel="Timeout in seconds"
          placeholder="default"
          onInput={setTimeout}
        />
        {!timeoutValid ? (
          <span class="hook-field-hint hook-field-hint-error">
            Must be a positive whole number of seconds.
          </span>
        ) : null}
      </div>

      <div class="hook-field">
        <span class="hook-field-label">Command</span>
        <TextArea
          value={command}
          rows={4}
          ariaLabel="Command"
          placeholder="Shell command to run"
          onInput={setCommand}
        />
      </div>

      <div class="d-actions">
        <Button variant="primary" disabled={!canSave} onClick={save}>
          <Icon name="check" /> Save
        </Button>
        <Button onClick={onCancel}>
          <Icon name="x" /> Cancel
        </Button>
      </div>
    </div>
  );
}
