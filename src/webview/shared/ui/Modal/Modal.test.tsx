// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { Modal } from "../Modal";

describe("Modal", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <Modal open={false} onClose={() => undefined}>
        body
      </Modal>,
    );
    expect(container.querySelector(".modal")).toBeNull();
  });

  it("renders title and invokes onClose on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose} title="Hello">
        body
      </Modal>,
    );
    expect(screen.getByText("Hello")).toBeTruthy();
    const backdrop = container.querySelector(".modal-backdrop") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on a real backdrop press+release (pointerdown then click on backdrop)", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        body
      </Modal>,
    );
    const backdrop = container.querySelector(".modal-backdrop") as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop, { detail: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close when a press began inside the modal and released on the backdrop", () => {
    // A text-selection drag: pointerdown inside the modal body, mouseup outside.
    // The bubbled click lands on the backdrop but must not dismiss.
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        body
      </Modal>,
    );
    const backdrop = container.querySelector(".modal-backdrop") as HTMLElement;
    const dialog = container.querySelector(".modal") as HTMLElement;
    fireEvent.pointerDown(dialog);
    fireEvent.click(backdrop, { detail: 1 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does NOT close when a click lands inside the modal", () => {
    const onClose = vi.fn();
    const { container, getByText } = render(
      <Modal open={true} onClose={onClose}>
        body
      </Modal>,
    );
    fireEvent.click(getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the webview loses focus (window blur)", () => {
    // A click elsewhere in VS Code blurs the webview iframe; the modal must
    // dismiss rather than stay open behind the editor. Routed through useDismiss.
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        body
      </Modal>,
    );
    // The hook listens on `window`; dispatch directly (fireEvent.blur targets
    // element focus semantics, not the window-level blur event).
    window.dispatchEvent(new Event("blur"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT dismiss on an outside pointerdown (backdrop owns its press gesture)", () => {
    // useDismiss runs with outsidePress:false here; a bare pointerdown outside
    // the dialog must not close — only a true backdrop press+release does.
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        body
      </Modal>,
    );
    const dialog = container.querySelector(".modal") as HTMLElement;
    fireEvent.pointerDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });
});
