/**
 * Lightweight modal with backdrop. Closes on Esc keypress and backdrop click.
 */
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ComponentChildren;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
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
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {title ? <div class="modal-title">{title}</div> : null}
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
