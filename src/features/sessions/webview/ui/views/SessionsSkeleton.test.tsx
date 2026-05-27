// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { SessionsSkeleton } from "./SessionsSkeleton";

describe("SessionsSkeleton", () => {
  it("mirrors the sessions list shell: actions, search, filters, chips, rows", () => {
    const { container } = render(<SessionsSkeleton />);
    expect(container.querySelector(".skeleton-actions")).toBeTruthy();
    expect(container.querySelector(".search-row")).toBeTruthy();
    expect(container.querySelector(".skeleton-filter-row")).toBeTruthy();
    expect(container.querySelector(".skeleton-chips-row")).toBeTruthy();
    // Rows reuse `.session-item` so they sit at the virtualizer's row height.
    expect(container.querySelector(".item.session-item.skeleton-session")).toBeTruthy();
  });

  it("renders six placeholder rows and is marked busy", () => {
    const { container } = render(<SessionsSkeleton />);
    expect(container.querySelectorAll(".skeleton-session").length).toBe(6);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
