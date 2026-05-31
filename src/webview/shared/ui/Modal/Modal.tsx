/**
 * Lightweight modal with backdrop. Closes on Escape, webview blur, and a
 * backdrop press that BEGAN on the backdrop.
 *
 * Escape + webview blur come from the shared `useDismiss` hook, so the modal
 * dismisses on the same gestures as every other transient surface (Menu et al.)
 * — including the webview losing focus (a click elsewhere in VS Code), which the
 * inlined Escape-only effect this replaced did not cover.
 *
 * Backdrop press stays a bespoke handler with `outsidePress: false` on the hook:
 * a plain `onClick={onClose}` on the backdrop closes the modal whenever the
 * click's `mouseup` lands on the backdrop — including when the user pressed down
 * inside the modal (e.g. selecting text in an input) and dragged out before
 * releasing. That accidental dismissal is the same class of "outside-click
 * closes when it shouldn't" bug fixed in <Menu>. We record where the press
 * started and only treat it as a backdrop dismissal when both the press and the
 * release are on the backdrop itself — a guard useDismiss's generic pointerdown
 * can't express, so the hook's outside-press is turned off here.
 */
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { useDismiss } from "../../hooks";

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
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape + webview blur via the shared hook. Outside-press is OFF — the
  // backdrop owns its own press gesture (the start-inside guard below); the
  // hook's generic pointerdown would dismiss on a text-drag that began inside.
  useDismiss({ open, onDismiss: onClose, contentRef: dialogRef, outsidePress: false });

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
      <div ref={dialogRef} class="modal" role="dialog" aria-modal="true">
        {title ? <div class="modal-title">{title}</div> : null}
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
