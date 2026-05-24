/**
 * Lightweight modal with backdrop. Closes on Esc keypress and on a backdrop
 * click that BEGAN on the backdrop.
 *
 * Why the pointerdown guard: a plain `onClick={onClose}` on the backdrop closes
 * the modal whenever the click's `mouseup` lands on the backdrop — including
 * when the user pressed down inside the modal (e.g. selecting text in an input)
 * and dragged out before releasing. That accidental dismissal is the same class
 * of "outside-click closes when it shouldn't" bug fixed in <Menu>. We record
 * where the press started and only treat it as a backdrop dismissal when both
 * the press and the release are on the backdrop itself.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ComponentChildren;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  // True only while a pointer press that STARTED on the backdrop is in flight.
  // A press that began inside the modal (text drag) leaves this false, so the
  // release won't dismiss even if the mouseup lands on the backdrop.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      class="modal-backdrop"
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Dismiss only when the release is on the backdrop AND the press began
        // there. (A direct programmatic click with no preceding pointerdown
        // leaves the ref false, so require either: started-on-backdrop, or a
        // bare click whose target IS the backdrop — the latter covers tests and
        // assistive-tech synthetic clicks.)
        if (e.target !== e.currentTarget) return;
        if (pressedBackdrop.current || e.detail === 0) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <div class="modal" role="dialog" aria-modal="true">
        {title ? <div class="modal-title">{title}</div> : null}
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
