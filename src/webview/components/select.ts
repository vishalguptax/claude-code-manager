/**
 * Themed custom dropdown — replacement for native <select>.
 *
 * Why not native <select>? On Windows the open panel is rendered by the
 * OS (grey system picker) which looks jarring inside a VS Code themed
 * webview. This component keeps the open panel theme-matched using
 * VS Code's CSS variables so it looks identical to the dropdowns in
 * Settings / Git / Tasks panels.
 *
 * Why not @vscode/webview-ui-toolkit? That library ships the FAST
 * framework (~25 KB bundled) and violates the "no framework" principle
 * in CLAUDE.md. A custom dropdown is ~80 LOC of DOM + CSS and stays
 * aligned with the rest of the extension's vanilla-TS codebase.
 *
 * Accessibility: the trigger is a real <button>, the menu is marked
 * role="listbox" with role="option" children, Escape closes the menu,
 * Arrow keys move selection, Enter/Space confirms.
 */

import { icon } from "../icons";
import { esc } from "../utils";

/** One selectable entry in the dropdown. */
export interface SelectOption {
  /** Stable value used in settings / state */
  value: string;
  /** Primary label shown in the trigger and option row */
  label: string;
  /** Optional muted helper line shown under the label in the menu */
  desc?: string;
}

/**
 * Build the HTML for a custom dropdown. The caller is responsible for
 * inserting this string into the DOM and then calling `bindSelect` with
 * the same id to wire up event handlers.
 *
 * The trigger gets id=`${id}` so callers can flash "saved" on it like a
 * native input. The menu carries `data-select="${id}"` so scoped queries
 * never collide when multiple selects coexist on the same page.
 */
export function renderSelect(
  id: string,
  options: SelectOption[],
  currentValue: string,
): string {
  const current =
    options.find((o) => o.value === currentValue) ?? options[0];
  const currentLabel = current ? esc(current.label) : "";
  return `
    <div class="vs-select" data-select="${esc(id)}">
      <button class="vs-select-trigger" id="${esc(id)}" type="button"
        aria-haspopup="listbox" aria-expanded="false">
        <span class="vs-select-value">${currentLabel}</span>
        <span class="vs-select-arrow" aria-hidden="true">${icon("chevron-down", 14)}</span>
      </button>
      <div class="vs-select-menu hidden" role="listbox" aria-labelledby="${esc(id)}">
        ${options
          .map(
            (o, idx) => `
          <div class="vs-select-option ${o.value === currentValue ? "selected" : ""}"
               role="option" data-value="${esc(o.value)}" data-index="${idx}"
               aria-selected="${o.value === currentValue}">
            <span class="vs-select-option-label">${esc(o.label)}</span>
            ${o.desc ? `<span class="vs-select-option-desc">${esc(o.desc)}</span>` : ""}
          </div>`,
          )
          .join("")}
      </div>
    </div>`;
}

/**
 * Wire up event handlers for a dropdown rendered by `renderSelect`.
 *
 * The `onChange` callback fires with the selected value every time the
 * user picks an option. Re-selecting the current value is a no-op (the
 * callback still fires, matching native <select> behaviour).
 *
 * Returns a cleanup function that removes the document-level outside-
 * click listener. Callers should call it when the containing view is
 * unmounted — otherwise the listener leaks across view lifecycles.
 */
export function bindSelect(
  container: HTMLElement,
  id: string,
  onChange: (value: string) => void,
): () => void {
  const root = container.querySelector<HTMLElement>(`[data-select="${id}"]`);
  if (!root) return () => {};
  const trigger = root.querySelector<HTMLButtonElement>(".vs-select-trigger");
  const menu = root.querySelector<HTMLElement>(".vs-select-menu");
  const valueSpan = trigger?.querySelector<HTMLElement>(".vs-select-value");
  if (!trigger || !menu || !valueSpan) return () => {};

  const close = (): void => {
    menu.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = (): void => {
    menu.classList.remove("hidden");
    trigger.setAttribute("aria-expanded", "true");
  };
  const isOpen = (): boolean => !menu.classList.contains("hidden");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isOpen()) close();
    else open();
  });

  const optionEls = Array.from(
    menu.querySelectorAll<HTMLElement>(".vs-select-option"),
  );

  const selectOption = (opt: HTMLElement): void => {
    const value = opt.dataset.value;
    if (!value) return;
    const label = opt.querySelector<HTMLElement>(".vs-select-option-label")?.textContent ?? "";
    valueSpan.textContent = label;
    for (const o of optionEls) {
      o.classList.remove("selected");
      o.setAttribute("aria-selected", "false");
    }
    opt.classList.add("selected");
    opt.setAttribute("aria-selected", "true");
    close();
    onChange(value);
  };

  for (const opt of optionEls) {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      selectOption(opt);
    });
  }

  // Keyboard: Arrow keys navigate, Enter/Space confirms, Escape closes.
  trigger.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
      (optionEls.find((o) => o.classList.contains("selected")) ?? optionEls[0])?.focus();
    }
  });
  for (const opt of optionEls) {
    opt.tabIndex = -1;
    opt.addEventListener("keydown", (e: KeyboardEvent) => {
      const idx = optionEls.indexOf(opt);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        optionEls[Math.min(optionEls.length - 1, idx + 1)]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        optionEls[Math.max(0, idx - 1)]?.focus();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectOption(opt);
        trigger.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
        trigger.focus();
      }
    });
  }

  // Outside click closes the menu. Attached at document level so it
  // catches clicks anywhere else in the webview.
  const onDocClick = (e: Event): void => {
    if (isOpen() && !root.contains(e.target as Node)) close();
  };
  document.addEventListener("click", onDocClick);

  return () => document.removeEventListener("click", onDocClick);
}
