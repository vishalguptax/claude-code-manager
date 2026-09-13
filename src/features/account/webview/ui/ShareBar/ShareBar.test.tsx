// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { ShareBar, type ShareSegment } from "./ShareBar";

const seg = (key: string, value: number, color = "#111"): ShareSegment => ({
  key,
  label: key,
  value,
  color,
});

const widths = (c: ParentNode): number[] =>
  [...c.querySelectorAll<HTMLElement>(".acct-share-seg")].map((n) =>
    parseFloat(n.style.width),
  );

describe("ShareBar", () => {
  it("sizes each segment by its share of the total", () => {
    const { container } = render(
      <ShareBar ariaLabel="Token share by model" segments={[seg("a", 50), seg("b", 30), seg("c", 20)]} />,
    );
    expect(widths(container)).toEqual([50, 30, 20]);
  });

  it("renders nothing when there is nothing to show", () => {
    const { container } = render(<ShareBar ariaLabel="x" segments={[]} />);
    expect(container.querySelector(".acct-share-bar")).toBeNull();
  });

  it("renders nothing when every segment is zero", () => {
    const { container } = render(
      <ShareBar ariaLabel="x" segments={[seg("a", 0), seg("b", 0)]} />,
    );
    expect(container.querySelector(".acct-share-bar")).toBeNull();
  });

  it("drops zero-value segments rather than rendering slivers of nothing", () => {
    const { container } = render(
      <ShareBar ariaLabel="x" segments={[seg("a", 10), seg("b", 0)]} />,
    );
    expect(container.querySelectorAll(".acct-share-seg").length).toBe(1);
  });

  // A model that ran at all should be visible. Sub-percent shares are floored
  // rather than dropped, and the difference comes off the largest segment so
  // the widths still total 100 and the bar has no gap at its end.
  it("keeps a tiny share visible without overflowing the bar", () => {
    const { container } = render(
      <ShareBar ariaLabel="x" segments={[seg("big", 999), seg("tiny", 1)]} />,
    );
    const [big, tiny] = widths(container);
    expect(tiny).toBeGreaterThanOrEqual(1.5);
    expect(big + tiny).toBeCloseTo(100, 5);
  });

  it("never lets the segments exceed the bar", () => {
    const { container } = render(
      <ShareBar
        ariaLabel="x"
        segments={[seg("a", 1000), seg("b", 1), seg("c", 1), seg("d", 1)]}
      />,
    );
    expect(widths(container).reduce((s, w) => s + w, 0)).toBeCloseTo(100, 5);
  });

  // The bar is one graphic, so it is announced once, in full — not as a row of
  // unlabelled boxes.
  it("announces the whole distribution to a screen reader", () => {
    const { container } = render(
      <ShareBar ariaLabel="Token share by model" segments={[seg("Opus 5", 60), seg("Haiku", 40)]} />,
    );
    const bar = container.querySelector(".acct-share-bar");
    expect(bar?.getAttribute("role")).toBe("img");
    expect(bar?.getAttribute("aria-label")).toBe(
      "Token share by model: Opus 5 60%, Haiku 40%",
    );
  });

  it("names each segment on hover", () => {
    const { container } = render(
      <ShareBar ariaLabel="x" segments={[seg("Opus 5", 60), seg("Haiku", 40)]} />,
    );
    expect(
      [...container.querySelectorAll(".acct-share-seg")].map((n) => n.getAttribute("title")),
    ).toEqual(["Opus 5 · 60%", "Haiku · 40%"]);
  });
});
