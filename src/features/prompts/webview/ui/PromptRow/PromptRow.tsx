/**
 * One row of the prompt list: the prompt text, where and when it was typed,
 * and the two things a user wants from it — the text back, or the session.
 *
 * The text is clamped in CSS rather than truncated here. Prompts run to
 * thousands of characters and the row lives inside a measured
 * <VirtualList>, so clamping in the stylesheet keeps the full text available
 * to selection and to the row's `title` while the measured height stays sane.
 */
import { formatRelativeTime } from "../../../../../webview/shared/lib";
import { Button, Icon } from "../../../../../webview/shared/ui";
import type { PromptEntry } from "../../../types";

export interface PromptRowProps {
  entry: PromptEntry;
  /** Ask the host to put this prompt on the clipboard. */
  onCopy: (text: string) => void;
  /** Ask the host to open the session this prompt was typed in. */
  onOpenSession: (sessionId: string) => void;
}

export function PromptRow({ entry, onCopy, onOpenSession }: PromptRowProps) {
  return (
    <div class="prompt-row">
      <div class="prompt-text" title={entry.text}>
        {entry.text}
      </div>
      <div class="prompt-meta">
        {entry.projectName ? (
          <span class="prompt-project" title={entry.projectPath}>
            {entry.projectName}
          </span>
        ) : null}
        {entry.timestamp > 0 ? (
          <span class="prompt-time">{formatRelativeTime(entry.timestamp)}</span>
        ) : null}
        {entry.repeatCount > 1 ? (
          <span
            class="prompt-repeat"
            title={`Sent ${entry.repeatCount} times in a row`}
          >
            ×{entry.repeatCount}
          </span>
        ) : null}
        {entry.attachmentCount > 0 ? (
          <span
            class="prompt-attachments"
            title={`${entry.attachmentCount} pasted attachment${
              entry.attachmentCount === 1 ? "" : "s"
            }${entry.attachmentChars > 0 ? `, ${entry.attachmentChars} characters` : ""} — not stored by this extension`}
          >
            <Icon name="package" size={11} />
            {entry.attachmentCount}
          </span>
        ) : null}
        <span class="prompt-actions">
          <Button
            variant="icon"
            iconName="copy"
            title="Copy prompt"
            ariaLabel={`Copy prompt: ${entry.text.slice(0, 60)}`}
            onClick={() => onCopy(entry.text)}
          />
          {entry.sessionId ? (
            <Button
              variant="icon"
              iconName="external-link"
              title="Open the session this prompt was typed in"
              ariaLabel={`Open session for prompt: ${entry.text.slice(0, 60)}`}
              onClick={() => onOpenSession(entry.sessionId)}
            />
          ) : null}
        </span>
      </div>
    </div>
  );
}
