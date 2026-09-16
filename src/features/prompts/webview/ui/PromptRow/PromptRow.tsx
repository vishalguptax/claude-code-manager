/**
 * One row of the prompt list: the prompt text, where and when it was typed,
 * and the two things a user wants from it — the text back, or the session.
 *
 * Built from the shared row vocabulary (`.item` + `.item-row1` / `.item-name`
 * / `.item-time` / `.item-row2`, declared once in components.css and
 * sessions.css) so a Prompts row has the same inset, height, hover and focus
 * ring as a Skills or Sessions row — and inherits the `claudeManager.density`
 * setting for free, since `.item` is already registered in density.css.
 *
 * The ROW is the open-session affordance. This tab has no detail view, so the
 * one navigational thing a prompt can do — take you back to the session it was
 * typed in — sits on the row click, the way every other tab's row click is its
 * primary navigation. A history line that recorded no session makes an inert
 * row (the cursor override lives in prompts.css).
 *
 * The text is clamped in CSS rather than cut here. Prompts run to thousands of
 * characters and the row lives inside a measured <VirtualList>, so clamping in
 * the stylesheet keeps the full text available to selection and to the row's
 * `title` while the measured height stays sane.
 */
import { formatRelativeTime } from "../../../../../webview/shared/lib";
import { Badge, Button, Tag } from "../../../../../webview/shared/ui";
import type { PromptEntry } from "../../../types";

/** Enough of the prompt to identify it in an action's accessible name. */
function preview(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * Tooltip for the attachment chip. The blobs themselves never leave disk —
 * the count and the size hint are all the list model carries.
 */
function attachmentTitle(entry: PromptEntry): string {
  const plural = entry.attachmentCount === 1 ? "" : "s";
  const size = entry.attachmentChars > 0 ? `, ${entry.attachmentChars} characters` : "";
  return `${entry.attachmentCount} pasted attachment${plural}${size} — never stored by this extension`;
}

export interface PromptRowProps {
  entry: PromptEntry;
  /** Ask the host to put this prompt on the clipboard. */
  onCopy: (text: string) => void;
  /** Ask the host to open the session this prompt was typed in. */
  onOpenSession: (sessionId: string) => void;
}

export function PromptRow({ entry, onCopy, onOpenSession }: PromptRowProps) {
  const openable = entry.sessionId !== "";
  const hasMeta =
    entry.projectName !== "" || entry.repeatCount > 1 || entry.attachmentCount > 0;

  const open = (): void => {
    if (openable) onOpenSession(entry.sessionId);
  };

  return (
    <div
      class="item prompt-item"
      role={openable ? "button" : undefined}
      tabIndex={openable ? 0 : undefined}
      title={openable ? "Open the session this prompt was typed in" : undefined}
      aria-label={openable ? `Open the session for prompt: ${preview(entry.text)}` : undefined}
      onClick={open}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        // The row hosts an inline action <Button>; Space on a focused BUTTON
        // is that button's own activation, not the row's.
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        e.preventDefault();
        open();
      }}
    >
      <div class="item-row1">
        <span class="item-name" title={entry.text}>
          {entry.text}
        </span>
        <Button
          variant="icon"
          class="item-copy-btn"
          iconName="copy"
          title="Copy prompt"
          ariaLabel={`Copy prompt: ${preview(entry.text)}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(entry.text);
          }}
        />
        {entry.timestamp > 0 ? (
          <span class="item-time">{formatRelativeTime(entry.timestamp)}</span>
        ) : null}
      </div>
      {hasMeta ? (
        <div class="item-row2">
          {entry.projectName ? (
            <Tag variant="folder" icon="folder" text={entry.projectName} title={entry.projectPath} />
          ) : null}
          {entry.repeatCount > 1 ? (
            // A count, not a warning: it explains why one row stands for
            // several sends.
            <Badge
              variant="count"
              text={`×${entry.repeatCount}`}
              title={`Sent ${entry.repeatCount} times in a row`}
            />
          ) : null}
          {entry.attachmentCount > 0 ? (
            <Tag icon="package" text={`${entry.attachmentCount}`} title={attachmentTitle(entry)} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
