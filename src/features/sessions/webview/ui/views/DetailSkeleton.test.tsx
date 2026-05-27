// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { DetailSkeleton } from "./DetailSkeleton";

describe("DetailSkeleton", () => {
  it("renders the detail body with header lines and message blocks", () => {
    const { container } = render(<DetailSkeleton />);
    expect(container.querySelector(".skeleton-detail-body")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-detail-block").length).toBe(3);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
