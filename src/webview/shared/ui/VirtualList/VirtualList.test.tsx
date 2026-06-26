// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { VirtualList } from "../VirtualList";

describe("VirtualList", () => {
  it("renders without crashing for an empty list", () => {
    const { container } = render(
      <VirtualList items={[]} itemHeight={20} renderItem={(i) => <div>{String(i)}</div>} />,
    );
    expect(container.querySelector(".virtual-list")).toBeTruthy();
  });

  it("renders at least one visible item for a populated list", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const { container } = render(
      <VirtualList items={items} itemHeight={20} renderItem={(i) => <div data-testid="row">{i}</div>} />,
    );
    expect(container.querySelectorAll('[data-testid="row"]').length).toBeGreaterThan(0);
  });

  it("reserves total scroll height from the estimate before rows are measured", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const { container } = render(
      <VirtualList items={items} itemHeight={20} renderItem={(i) => <div>{i}</div>} />,
    );
    const spacer = container.querySelector(".virtual-list-spacer") as HTMLElement;
    // 50 rows × 20px estimate (no real measurement in happy-dom).
    expect(spacer.style.height).toBe("1000px");
  });

  it("absolutely positions each row at its cumulative offset", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const { container } = render(
      <VirtualList items={items} itemHeight={20} renderItem={(i) => <div class="r">{i}</div>} />,
    );
    const wrappers = Array.from(
      container.querySelectorAll(".virtual-list-spacer > div"),
    ) as HTMLElement[];
    expect(wrappers[0].style.position).toBe("absolute");
    expect(wrappers[0].style.top).toBe("0px");
    // Second visible row sits one estimate down.
    expect(wrappers[1].style.top).toBe("20px");
  });
});
