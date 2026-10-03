/**
 * InfoTip — a small info glyph that carries an explanation in its tooltip.
 *
 * For text that helps but should not be on screen all the time: what a
 * setting actually does, beyond what its label already says. A help line
 * under every control turned the Config tab into a wall of prose that hid
 * the controls themselves; this keeps each explanation one hover or one Tab
 * away instead.
 *
 * It is focusable, and the panel's TooltipLayer shows tooltips on keyboard
 * focus as well as hover, so the text is never pointer-only. `aria-label`
 * carries the same text for screen readers.
 */
import { Icon } from "../Icon";

export interface InfoTipProps {
  /** The explanation. Shown as the tooltip and read as the accessible name. */
  text: string;
}

export function InfoTip({ text }: InfoTipProps) {
  return (
    <span class="info-tip" role="img" tabIndex={0} title={text} aria-label={text}>
      <Icon name="info" size={12} />
    </span>
  );
}
