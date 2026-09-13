/**
 * One styled tooltip for the whole panel.
 *
 * Every affordance here already carries a `title`, but in a webview the native
 * tooltip is the host OS one: it takes about a second to appear, it is drawn in
 * the system's own chrome rather than the theme's, and it does not follow the
 * element when a row scrolls. In a dense sidebar where most controls are
 * icon-only, that is the difference between a discoverable panel and a row of
 * unlabelled glyphs.
 *
 * This mounts once and works by delegation, so no call site changes and
 * nothing can be forgotten: any element with a `title` gets the styled
 * tooltip, including ones added later. The native tooltip is suppressed while
 * the pointer is on the element by moving the text to `data-title` and putting
 * it back on the way out — the attribute is restored, so nothing is lost for
 * anything reading the DOM, and `aria-label` (which is what a screen reader
 * uses) is never touched.
 */
import { useEffect, useRef, useState } from "preact/hooks";

/** Hover dwell before a tooltip appears. Matches VS Code's own delay. */
const DELAY_MS = 500;
/** Gap between the element and its tooltip. */
const OFFSET = 6;
/** Keep the tooltip this far inside the panel edges. */
const MARGIN = 6;

interface Tip {
  text: string;
  x: number;
  y: number;
  /** Below the element by default; flipped above when there is no room. */
  above: boolean;
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The element whose title is currently parked in data-title.
  const held = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /** Put a parked title back on the element it came from. */
    const release = (): void => {
      const el = held.current;
      held.current = null;
      if (!el) return;
      const parked = el.getAttribute("data-title");
      if (parked !== null) {
        el.setAttribute("title", parked);
        el.removeAttribute("data-title");
      }
    };

    const hide = (): void => {
      clearTimeout(timer.current);
      release();
      setTip(null);
    };

    const onOver = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.("[title]") as HTMLElement | null;
      if (!el) {
        // Left the titled element (or moved to something without one).
        if (held.current) hide();
        return;
      }
      if (el === held.current) return;

      hide();
      const text = el.getAttribute("title");
      if (!text) return;

      // Park the native title so the OS tooltip does not also fire.
      el.setAttribute("data-title", text);
      el.removeAttribute("title");
      held.current = el;

      timer.current = setTimeout(() => {
        const box = el.getBoundingClientRect();
        // Anchor on the element's centre; the tooltip is centred on this x and
        // clamped into the panel after it has been measured.
        setTip({
          text,
          x: box.left + box.width / 2,
          y: box.bottom + OFFSET,
          above: false,
        });
      }, DELAY_MS);
    };

    // Any of these mean the pointer is no longer dwelling on the control.
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    // Scrolling moves the element out from under a tooltip anchored in
    // viewport coordinates, so drop it rather than let it float.
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);

    return () => {
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
      hide();
    };
  }, []);

  // Clamp into the panel once the tooltip has a measured size. A sidebar is
  // ~300px wide, so a tooltip centred on a control near either edge would
  // otherwise be cut off — which is exactly where the icon-only buttons sit.
  useEffect(() => {
    const el = tipRef.current;
    if (!tip || !el) return;
    const box = el.getBoundingClientRect();
    let x = tip.x - box.width / 2;
    x = Math.max(MARGIN, Math.min(x, window.innerWidth - box.width - MARGIN));
    let y = tip.y;
    let above = tip.above;
    if (!above && y + box.height + MARGIN > window.innerHeight) {
      above = true;
      y = tip.y - box.height - OFFSET * 2 - box.height * 0;
    }
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(above ? y : y)}px`;
    el.style.visibility = "visible";
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={tipRef} class="tooltip" role="tooltip">
      {tip.text}
    </div>
  );
}
