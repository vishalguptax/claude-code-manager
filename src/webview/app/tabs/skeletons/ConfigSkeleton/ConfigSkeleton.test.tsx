// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ConfigSkeleton } from "./ConfigSkeleton";

describe("ConfigSkeleton", () => {
  // The tab's own shape, so nothing jumps when the data lands: two open
  // sections of fields and toggles, then six folded section headers.
  it("draws the two open sections, then the folded section headers", () => {
    const { container } = render(<ConfigSkeleton />);
    expect(container.querySelectorAll(".section").length).toBe(8);
    expect(container.querySelectorAll(".section .section-body").length).toBe(2);
    expect(container.querySelectorAll(".skeleton-field").length).toBe(3);
    expect(container.querySelectorAll(".skeleton-toggle").length).toBe(3);
    expect(container.querySelector(".skeleton-field .skeleton-block")).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("ends with a flex-grow filler so the panel reads as covered top to bottom", () => {
    // Without this spacer the single fixed section leaves empty room below on
    // a tall sidebar; the filler absorbs that room so the loading state looks
    // edge-to-edge.
    const { container } = render(<ConfigSkeleton />);
    const panel = container.querySelector(".panel.skeleton-panel");
    expect(panel?.lastElementChild?.classList.contains("skeleton-fill")).toBe(true);
  });
});
