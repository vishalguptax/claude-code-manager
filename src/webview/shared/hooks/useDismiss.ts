/**
 * useDismiss — the single source of truth for "this transient surface should
 * close itself" across the webview. Centralizes the outside-press / Escape /
 * webview-blur logic that <Menu> pioneered so every overlay (Menu, Modal,
 * future popovers) dismisses identically instead of each re-implementing — and
 * subtly diverging on — the same three gestures.
 *
 * While `open`, it dismisses on:
 *   (a) a pointerdown (capture, passive) that lands OUTSIDE the content element
 *       and outside every provided `ignore` element (e.g. the toggle/anchor
 *       that owns the open state),
 *   (b) an Escape keydown,
 *   (c) the webview window losing focus (`blur`) — a pointerdown inside the
 *       iframe never fires for a click elsewhere in VS Code (the editor, another
 *       panel), so without this an overlay would stay open when the user clicks
 *       outside the extension entirely.
 *
 * Anchor/ignore exclusion is what lets a toggle own its own open state: the
 * trigger's onClick is the single source of toggle truth, so re-clicking an open
 * trigger closes it cleanly instead of the document listener closing on
 * pointerdown only for the click to immediately reopen (the close-then-reopen
 * flicker <Menu> documented).
 *
 * pointerdown (capture) fires before a trigger's click for both mouse and touch,
 * so dismissal is decided before any toggle handler runs.
 *
 * Stable subscription: onDismiss and the refs are read through internal holder
 * refs updated every render, so the listeners attach ONCE per open — not on
 * every parent render. Parents commonly pass a fresh inline onDismiss / a fresh
 * RefObject each render; depending on them directly would re-attach the document
 * listeners constantly. The effect depends only on `open`.
 */
import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface UseDismissOptions {
  /** Whether the surface is currently open. Listeners attach only while true. */
  open: boolean;
  /** Called to close the surface when a dismiss gesture fires. */
  onDismiss: () => void;
  /**
   * The surface's content element. A pointerdown inside it never dismisses.
   * May be null before mount; a null ref simply means "no inside region yet".
   */
  contentRef: RefObject<HTMLElement | null>;
  /**
   * Extra elements to exclude from outside-press dismissal (e.g. the anchor /
   * trigger that toggles the surface). A pointerdown on any of them is ignored.
   */
  ignore?: Array<RefObject<HTMLElement | null>>;
  /**
   * Whether a pointerdown outside the content dismisses. Defaults to true.
   * Set false when the surface owns a bespoke outside-press gesture that
   * useDismiss's generic pointerdown can't express — e.g. <Modal>'s backdrop,
   * which must NOT dismiss on a text-selection drag that began inside the
   * dialog and released on the backdrop. Those surfaces still get Escape +
   * webview-blur from this hook, keeping all three gestures consistent.
   */
  outsidePress?: boolean;
}

export function useDismiss({
  open,
  onDismiss,
  contentRef,
  ignore,
  outsidePress = true,
}: UseDismissOptions): void {
  // Read onDismiss + the ignore list through stable holders so the effect can
  // use the latest values without listing them in its dependency array (which
  // would re-attach listeners on every parent render). contentRef is itself a
  // stable RefObject from the caller, so it is safe to capture directly.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;

  useEffect(() => {
    if (!open) return;

    const onDown = (e: Event): void => {
      const target = e.target as Node | null;
      const content = contentRef.current;
      if (content && target && content.contains(target)) return;
      const ignored = ignoreRef.current;
      if (ignored && target) {
        for (const r of ignored) {
          const el = r.current;
          if (el && el.contains(target)) return;
        }
      }
      onDismissRef.current();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onDismissRef.current();
    };
    const onBlur = (): void => onDismissRef.current();

    // Defer attaching the outside-press listener one tick so the same press
    // that opened the surface does not immediately close it. The listener only
    // ever calls onDismiss (never preventDefault), so it is passive.
    const id = outsidePress
      ? setTimeout(
          () => document.addEventListener("pointerdown", onDown, { capture: true, passive: true }),
          0,
        )
      : undefined;
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      if (id !== undefined) clearTimeout(id);
      document.removeEventListener("pointerdown", onDown, { capture: true });
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [open, contentRef, outsidePress]);
}
