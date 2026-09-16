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

  describe("accessibility", () => {
    const items = Array.from({ length: 500 }, (_, i) => i);

    it("exposes the container as a list and the spacer as presentational", () => {
      const { container } = render(
        <VirtualList items={items} itemHeight={20} renderItem={(i) => <div>{i}</div>} />,
      );
      expect(container.querySelector(".virtual-list")?.getAttribute("role")).toBe("list");
      // The spacer must not sit between the list and its items as a
      // generic element, or the list/listitem relationship is severed.
      expect(container.querySelector(".virtual-list-spacer")?.getAttribute("role")).toBe(
        "presentation",
      );
    });

    it("reports the REAL set size on every row, not the windowed count", () => {
      // The whole point: only a handful of rows exist in the DOM, but a
      // screen reader must still say "1 of 500".
      const { container } = render(
        <VirtualList items={items} itemHeight={20} renderItem={(i) => <div>{i}</div>} />,
      );
      const rows = Array.from(container.querySelectorAll('[role="listitem"]')) as HTMLElement[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThan(items.length);
      for (const row of rows) {
        expect(row.getAttribute("aria-setsize")).toBe("500");
      }
    });

    it("numbers rows from one, by real index", () => {
      const { container } = render(
        <VirtualList items={items} itemHeight={20} renderItem={(i) => <div>{i}</div>} />,
      );
      const rows = Array.from(container.querySelectorAll('[role="listitem"]')) as HTMLElement[];
      expect(rows[0].getAttribute("aria-posinset")).toBe("1");
      expect(rows[1].getAttribute("aria-posinset")).toBe("2");
    });

    it("names the list when a label is given", () => {
      const { container } = render(
        <VirtualList
          items={items}
          itemHeight={20}
          label="Sessions"
          renderItem={(i) => <div>{i}</div>}
        />,
      );
      expect(container.querySelector(".virtual-list")?.getAttribute("aria-label")).toBe("Sessions");
    });

    it("omits the name entirely when no label is given", () => {
      const { container } = render(
        <VirtualList items={items} itemHeight={20} renderItem={(i) => <div>{i}</div>} />,
      );
      // An empty aria-label is worse than none — it names the list "".
      expect(container.querySelector(".virtual-list")?.hasAttribute("aria-label")).toBe(false);
    });

    it("still exposes a list role when empty", () => {
      const { container } = render(
        <VirtualList items={[]} itemHeight={20} renderItem={(i) => <div>{String(i)}</div>} />,
      );
      expect(container.querySelector(".virtual-list")?.getAttribute("role")).toBe("list");
      expect(container.querySelectorAll('[role="listitem"]').length).toBe(0);
    });
  });
});
