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
  if (total <= threshold) return null;

  if (!expanded) {
    return (
      <button type="button" class="show-more" onClick={() => onToggle(true)}>
        Show {total - threshold} more{noun ? ` ${noun}` : ""}
      </button>
    );
  }
  return (
    <button type="button" class="show-more" onClick={() => onToggle(false)}>
      Show less
    </button>
  );
}
