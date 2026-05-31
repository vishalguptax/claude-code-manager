// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ConfigSkeleton } from "./ConfigSkeleton";

describe("ConfigSkeleton", () => {
  it("renders a section of form-field placeholders (label line + control block)", () => {
    const { container } = render(<ConfigSkeleton />);
    expect(container.querySelector(".acct-section .acct-section-body")).toBeTruthy();
    // Five field placeholders, each a label line above a control-height block.
    expect(container.querySelectorAll(".skeleton-field").length).toBe(5);
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
