// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { clampMenuPosition, Menu, type MenuItem } from "../Menu";

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

  describe("clampMenuPosition", () => {
    const GUTTER = 8;

    it("leaves a menu that already fits untouched", () => {
      expect(clampMenuPosition(20, 30, 180, 100, 1024, 768)).toEqual({ left: 20, top: 30 });
    });

    it("flips left when the right edge overflows the viewport", () => {
      // Anchor at x=900, 200px-wide menu → 1100 > 1024, so it opens to the left
      // of the anchor (900 - 200 = 700), still inside the gutter band.
      const { left } = clampMenuPosition(900, 0, 200, 100, 1024, 768);
      expect(left).toBe(700);
    });

    it("clamps into a narrow sidebar so the whole menu stays on-screen", () => {
      // 300px panel, 240px menu opened near the right edge. After the left flip
      // it must still sit within [GUTTER, vw - w - GUTTER].
      const w = 240;
      const vw = 300;
      const { left } = clampMenuPosition(280, 0, w, 100, vw, 800);
      expect(left).toBeGreaterThanOrEqual(GUTTER);
      expect(left + w).toBeLessThanOrEqual(vw - GUTTER);
    });

    it("pins to the left gutter when the menu is wider than the panel can hold", () => {
      // 200px panel, 240px menu — cannot fully fit; clamp wins at the left edge.
      const { left } = clampMenuPosition(150, 0, 240, 100, 200, 800);
      expect(left).toBe(GUTTER);
    });

    it("flips above the anchor when the bottom overflows", () => {
      const { top } = clampMenuPosition(0, 700, 180, 200, 1024, 768);
      expect(top).toBe(500); // 700 - 200
    });
  });
});
