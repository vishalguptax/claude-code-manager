// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu";

function items(onSelect = vi.fn()): ContextMenuItem[] {
  return [
    { label: "Rename", icon: "pencil", onSelect },
    { label: "Delete", icon: "trash-2", danger: true, separatorBefore: true, onSelect },
  ];
}

describe("ContextMenu", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ContextMenu open={false} x={0} y={0} items={items()} onClose={() => {}} />,
    );
    expect(container.querySelector(".ctx-menu")).toBeNull();
  });

  it("renders items at the requested position when open", () => {
    const { container } = render(
      <ContextMenu open={true} x={12} y={34} items={items()} onClose={() => {}} />,
    );
    const menu = container.querySelector(".ctx-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.style.left).toBe("12px");
    expect(menu.style.top).toBe("34px");
    expect(container.querySelectorAll(".ctx-item").length).toBe(2);
  });

  it("marks danger items and renders separators", () => {
    const { container } = render(
      <ContextMenu open={true} x={0} y={0} items={items()} onClose={() => {}} />,
    );
    expect(container.querySelector(".ctx-item.del")?.textContent).toContain("Delete");
    expect(container.querySelector(".ctx-sep")).toBeTruthy();
  });

  it("fires onSelect then onClose when an item is chosen", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <ContextMenu open={true} x={0} y={0} items={items(onSelect)} onClose={onClose} />,
    );
    fireEvent.click(getByText("Rename"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<ContextMenu open={true} x={0} y={0} items={items()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
