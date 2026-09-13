/**
 * "Show N more" / "Show less" for a list that renders a head by default.
 *
 * Long lists in a sidebar are a scrolling problem, not a data problem: the
 * Account tab's project and tool breakdowns already solved it by rendering a
 * few rows and disclosing the rest, and the Config tab's permission lists have
 * the same shape and a worse case — around sixty allowed patterns push
 * everything below them past three screenfuls.
 *
 * Takes `total` and `threshold`, not "how many are on screen". Both states are
 * then derived from the same two numbers, so the control cannot disagree with
 * the list it belongs to: an earlier signature took the rendered count, which
 * equals `total` once expanded and made "Show less" impossible to reach.
 *
 * Renders nothing when the list is shorter than its threshold, so a caller can
 * place it unconditionally after the list.
 */
import { useRef } from "preact/hooks";
import { keepAnchored } from "../../lib";

export interface ShowMoreProps {
  /** Items in the full list. */
  total: number;
  /** How many render while collapsed. */
  threshold: number;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  /** Plural noun for the label — "more" alone is vague in a dense panel. */
  noun?: string;
}

export function ShowMore({ total, threshold, expanded, onToggle, noun }: ShowMoreProps) {
  const ref = useRef<HTMLButtonElement>(null);
  if (total <= threshold) return null;

  // "Show less" drops every disclosed row at once, which can shorten the panel
  // past its scroll offset and throw this control off screen. Both directions
  // are anchored so the button stays under the pointer either way.
  const set = (next: boolean) => (): void => keepAnchored(ref.current, () => onToggle(next));

  if (!expanded) {
    return (
      <button ref={ref} type="button" class="show-more" onClick={set(true)}>
        Show {total - threshold} more{noun ? ` ${noun}` : ""}
      </button>
    );
  }
  return (
    <button ref={ref} type="button" class="show-more" onClick={set(false)}>
      Show less
    </button>
  );
}
