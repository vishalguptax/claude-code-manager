// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Menu, type MenuItem } from "../Menu";

function items(onSelect = vi.fn()): MenuItem[] {
  return [
    { label: "Copy", icon: "copy", hint: "Ctrl+C", onSelect },
    { label: "Refresh", icon: "refresh-cw", disabled: true, onSelect },
    { label: "Delete", icon: "trash-2", danger: true, separatorBefore: true, onSelect },
  ];
}

describe("Menu", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Menu open={false} x={0} y={0} items={items()} onClose={() => {}} />,
    );
    expect(container.querySelector(".vsc-menu")).toBeNull();
  });

  it("renders items at the requested position when open", () => {
    const { container } = render(
      <Menu open={true} x={12} y={34} items={items()} onClose={() => {}} />,
    );
    const menu = container.querySelector(".vsc-menu") as HTMLElement;
    expect(menu.style.left).toBe("12px");
    expect(menu.style.top).toBe("34px");
    expect(container.querySelectorAll(".vsc-menu-item").length).toBe(3);
  });

  it("renders a right-aligned keybinding hint", () => {
    const { container } = render(<Menu open={true} x={0} y={0} items={items()} onClose={() => {}} />);
    expect(container.querySelector(".vsc-menu-hint")?.textContent).toBe("Ctrl+C");
  });

  it("marks danger and disabled items and renders separators", () => {
    const { container } = render(<Menu open={true} x={0} y={0} items={items()} onClose={() => {}} />);
    expect(container.querySelector(".vsc-menu-item.danger")?.textContent).toContain("Delete");
    expect(container.querySelector(".vsc-menu-item.disabled")?.textContent).toContain("Refresh");
    expect(container.querySelector(".vsc-menu-sep")).toBeTruthy();
  });

  it("fires onSelect then onClose for an enabled item", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <Menu open={true} x={0} y={0} items={items(onSelect)} onClose={onClose} />,
    );
    fireEvent.click(getByText("Copy"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not fire onSelect or onClose for a disabled item", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <Menu open={true} x={0} y={0} items={items(onSelect)} onClose={onClose} />,
    );
    fireEvent.click(getByText("Refresh"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Menu open={true} x={0} y={0} items={items()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
