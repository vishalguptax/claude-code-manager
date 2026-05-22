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
});
