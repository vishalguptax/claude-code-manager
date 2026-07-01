// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { DetailSkeleton } from "./DetailSkeleton";

describe("DetailSkeleton", () => {
  it("mirrors the detail layout: header, actions, and message cards", () => {
    const { container } = render(<DetailSkeleton />);
    expect(container.querySelector(".skeleton-detail")).toBeTruthy();
    expect(container.querySelector(".skeleton-d-head")).toBeTruthy();
    expect(container.querySelector(".skeleton-d-actions")).toBeTruthy();
    expect(container.querySelector(".skeleton-d-section")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-d-msg").length).toBe(4);
    // User-role cards carry the accent variant.
    expect(container.querySelectorAll(".skeleton-d-msg.is-user").length).toBe(2);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
