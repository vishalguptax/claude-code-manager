/**
 * Inline edit form for a hook's matcher + command. Saving fires the
 * `onSave` callback (which posts `updateHook`); the host's reply re-renders
 * the detail surface via the regular `hooks` round-trip. Save is disabled
 * while the command is empty — a hook with no command is meaningless.
 */
import { useState } from "preact/hooks";
import { Button } from "../../../../webview/shared/ui";
import { Icon } from "../../../../webview/shared/ui";
import type { Hook } from "../../types";

export interface EditFormProps {
  hook: Hook;
  onSave: (next: { matcher: string; command: string }) => void;
  onCancel: () => void;
}

export function EditForm({ hook, onSave, onCancel }: EditFormProps) {
  const [matcher, setMatcher] = useState(hook.matcher);
  const [command, setCommand] = useState(hook.command);

  const trimmedCommand = command.trim();
  const canSave = trimmedCommand.length > 0;

  return (
    <div class="d-section">
      <div class="d-label">Edit hook</div>
      <div class="hook-field">
        <label class="hook-field-label" for="hookEditMatcher">
          Matcher
        </label>
        <input
          class="hook-field-input"
          id="hookEditMatcher"
          type="text"
          value={matcher}
          placeholder="Tool name or pattern (blank = match all)"
          onInput={(e) => setMatcher((e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <div class="hook-field">
        <label class="hook-field-label" for="hookEditCommand">
          Command
        </label>
        <textarea
          class="hook-field-input hook-edit-command"
          id="hookEditCommand"
          rows={4}
          placeholder="Shell command to run"
          value={command}
          onInput={(e) => setCommand((e.currentTarget as HTMLTextAreaElement).value)}
        />
      </div>
      <div class="d-actions">
        <Button
          variant="primary"
          disabled={!canSave}
          onClick={() => {
            if (!canSave) return;
            onSave({ matcher: matcher.trim(), command: trimmedCommand });
          }}
        >
          <Icon name="check" /> Save
        </Button>
        <Button onClick={onCancel}>
          <Icon name="x" /> Cancel
        </Button>
      </div>
    </div>
  );
}
