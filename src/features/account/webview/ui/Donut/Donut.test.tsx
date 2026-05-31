// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it } from "vitest";
import { Donut } from "./Donut";

describe("Donut", () => {
  it("renders one arc circle per segment plus the track", () => {
    const { container } = render(
      h(Donut, {
        segments: [
          { key: "a", value: 50, color: "red" },
          { key: "b", value: 50, color: "blue" },
        ],
      }),
    );
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(3); // 1 track + 2 arcs
    expect(container.querySelector(".acct-donut-track")).toBeTruthy();
    expect(container.querySelectorAll(".acct-donut-arc").length).toBe(2);
  });

  it("renders only the track when all values are zero", () => {
    const { container } = render(
      h(Donut, { segments: [{ key: "x", value: 0, color: "red" }] }),
    );
    expect(container.querySelectorAll(".acct-donut-arc").length).toBe(0);
    expect(container.querySelector(".acct-donut-track")).toBeTruthy();
  });

  it("sets a non-zero stroke-dasharray for a segment with positive value", () => {
    const { container } = render(
      h(Donut, { segments: [{ key: "x", value: 1, color: "red" }] }),
    );
    const arc = container.querySelector(".acct-donut-arc");
    expect(arc).toBeTruthy();
    const da = arc!.getAttribute("stroke-dasharray");
    expect(da).toBeTruthy();
    const [visible] = (da as string).split(" ").map(Number);
    expect(visible).toBeGreaterThan(0);
  });
});
