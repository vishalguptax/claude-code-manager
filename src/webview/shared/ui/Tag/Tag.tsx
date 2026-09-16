/**
 * Tag — the small pill that annotates a row: a git branch, a worktree, a
 * project folder, a temp-session marker, a skill keyword.
 *
 * These were raw `<span>`s with hand-assembled class strings in three files.
 * That is fine until the set has to stay consistent: the worktree pill alone
 * composes four modifiers, and the "wrap the label in `.tag-text` or it will
 * not ellipsize" rule is invisible at the call site — the Skills tab had in
 * fact never applied it, so a long keyword clipped mid-word there while the
 * identical chip in Sessions ellipsised correctly. A component makes that
 * structure the default instead of something each caller has to remember.
 *
 * Colour and geometry stay in CSS (`.tag` and its modifiers); this owns only
 * which modifiers a given kind of tag gets.
 */
import { cx } from "../../lib";
import { Icon } from "../Icon";

/** What the tag is labelling. Drives the colour, never the geometry. */
export type TagVariant =
  /** Branch names, skill keywords — anything with no semantics of its own. */
  | "neutral"
  /** A project folder: the quietest of the set, no fill. */
  | "folder"
  /** An ephemeral session whose transcript is deleted with its terminal. */
  | "temp"
  /** A git worktree a session ran in. */
  | "worktree";

/** Who created the worktree. Ignored by every other variant. */
export type TagTone = "claude" | "user";

export interface TagProps {
  text: string;
  variant?: TagVariant;
  /** Lucide icon name rendered as a leading glyph. */
  icon?: string;
  /**
   * Secondary label after the main one, separated by a middot. Used by the
   * worktree pill to carry its branch alongside its name.
   */
  detail?: string;
  tone?: TagTone;
  /** The thing this names is gone from disk: dimmed, with the name struck. */
  missing?: boolean;
  /** Something holds a lock on it (a session is likely running): firmer edge. */
  locked?: boolean;
  title?: string;
  class?: string;
}

export function Tag({
  text,
  variant = "neutral",
  icon,
  detail,
  tone,
  missing = false,
  locked = false,
  title,
  class: cls,
}: TagProps) {
  const wt = variant === "worktree";
  return (
    <span
      class={cx(
        "tag",
        variant === "folder" && "folder",
        variant === "temp" && "tag-temp",
        wt && "tag-wt",
        wt && tone && `tag-wt--${tone}`,
        wt && missing && "tag-wt--missing",
        // A missing worktree is already saying the louder thing; stacking the
        // lock ring on top of the strike-through reads as two states at once.
        wt && locked && !missing && "tag-wt--locked",
        cls,
      )}
      title={title}
    >
      {icon ? <Icon name={icon} size={9} /> : null}
      {/* Always a span, never bare text: a chip is a flex container, and
          `text-overflow: ellipsis` does not apply to an anonymous flex item —
          bare text clips mid-word instead of ellipsising. */}
      <span class={wt ? "tag-wt__name" : "tag-text"}>{text}</span>
      {detail ? <span class="tag-wt__branch">{detail}</span> : null}
    </span>
  );
}
