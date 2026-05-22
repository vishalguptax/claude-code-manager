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
});
