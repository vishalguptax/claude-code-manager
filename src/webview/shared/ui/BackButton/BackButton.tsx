/**
 * BackButton — the single "return to list" affordance for every detail/form
 * view. Before this, each feature hand-rolled its own back control: sessions a
 * raw chromeless <button>, agents/mcp a bordered secondary <Button>, hooks an
 * underlined link override, and commands/skills a `variant="icon"` <Button>
 * whose fixed 32px width clipped the label to "Bac". One component, one style,
 * everywhere — a chromeless icon+label link that reads as inline navigation,
 * not a control.
 *
 * Deliberately a raw <button> (not the themed <Button>): a back affordance has
 * no fill/border chrome, so layering `.btn` base styles only to override them
 * away (what hooks/commands/skills each did differently) is the exact churn
 * this removes.
 */
import { Icon } from "../Icon";

export interface BackButtonProps {
  onClick: (e: MouseEvent) => void;
  /** Label after the arrow. Defaults to "Back"; kept a prop for future i18n. */
  label?: string;
  /** Extra class for the rare call site that needs a layout tweak. */
  class?: string;
}

export function BackButton({ onClick, label = "Back", class: cls }: BackButtonProps) {
  return (
    <button type="button" class={cls ? `back-btn ${cls}` : "back-btn"} onClick={onClick}>
      <Icon name="arrow-left" size={14} />
      {label}
    </button>
  );
}
