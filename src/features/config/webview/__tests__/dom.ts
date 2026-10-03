/**
 * DOM helpers shared by the Config section tests: find a checkbox by its
 * caption, read or pick a Dropdown value, and read an InfoTip's text.
 */
import { fireEvent } from "@testing-library/preact";

/**
 * The shared <Checkbox> mirrors its caption onto the native input's
 * aria-label. Matched in JS rather than with an attribute selector because
 * some captions contain double quotes, which no CSS string escaping in
 * happy-dom accepts.
 */
export function findToggle(container: ParentNode, label: string): HTMLInputElement | null {
  return (
    ([...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[]).find(
      (el) => el.getAttribute("aria-label") === label,
    ) ?? null
  );
}

/** Same lookup, asserting the control exists, for the click cases. */
export function toggle(container: ParentNode, label: string): HTMLInputElement {
  const el = findToggle(container, label);
  if (!el) throw new Error(`no checkbox labelled "${label}"`);
  return el;
}

/** The current label shown on a Dropdown trigger. */
export function triggerLabel(container: ParentNode, label: string): string {
  return (
    (container.querySelector(`.vsc-dropdown-trigger[aria-label="${label}"]`) as HTMLElement | null)
      ?.textContent?.trim() ?? ""
  );
}

/** Open a Dropdown and choose an option by its label. */
export function choose(container: ParentNode, label: string, option: string): void {
  const trigger = container.querySelector(
    `.vsc-dropdown-trigger[aria-label="${label}"]`,
  ) as HTMLButtonElement;
  fireEvent.click(trigger);
  const row = Array.from(container.querySelectorAll(".vsc-menu-label")).find(
    (l) => l.textContent === option,
  ) as HTMLElement;
  fireEvent.click(row);
}

/** The explanation behind the InfoTip in the same field as `label`. */
export function infoFor(container: ParentNode, label: string): string | null {
  const field = Array.from(container.querySelectorAll(".field")).find((f) =>
    (f.textContent ?? "").includes(label),
  );
  return field?.querySelector(".info-tip")?.getAttribute("aria-label") ?? null;
}
