// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { ListSkeleton } from "./ListSkeleton";

describe("ListSkeleton", () => {
  it("mirrors the list shell: search row, scope filter, and list rows", () => {
    const { container } = render(<ListSkeleton />);
    expect(container.querySelector(".skeleton-panel")).toBeTruthy();
    expect(container.querySelector(".search-row")).toBeTruthy();
    expect(container.querySelector(".skeleton-scope-row")).toBeTruthy();
    // Rows reuse the real `.item` box so they align with live rows.
    expect(container.querySelector(".list.skeleton-list-rows .item.skeleton-item")).toBeTruthy();
  });

  it("renders the requested number of rows and is marked busy", () => {
    const { container } = render(<ListSkeleton rows={5} />);
    expect(container.querySelectorAll(".skeleton-item").length).toBe(5);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("omits the scope filter when scopeFilter=false", () => {
    const { container } = render(<ListSkeleton scopeFilter={false} />);
    expect(container.querySelector(".skeleton-scope-row")).toBeNull();
  });
});
