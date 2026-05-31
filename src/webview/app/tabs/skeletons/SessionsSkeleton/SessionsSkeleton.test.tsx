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
    // Rows reuse the real `.session-item` + `.item-row1/.item-prompt/.item-row2`
    // structure so spacing matches the loaded row.
    expect(container.querySelector(".skeleton-list-rows > .item.session-item")).toBeTruthy();
    expect(container.querySelector(".session-item .item-row1")).toBeTruthy();
    expect(container.querySelector(".session-item .item-prompt")).toBeTruthy();
    expect(container.querySelector(".session-item .item-row2")).toBeTruthy();
  });

  it("renders enough placeholder rows to fill the panel and is marked busy", () => {
    const { container } = render(<SessionsSkeleton />);
    expect(container.querySelectorAll(".skeleton-list-rows > .session-item").length).toBe(14);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("uses .panel so the column grows to the full sidebar height", () => {
    // The .panel rule (base.css) is height:100% + flex column; combined with the
    // .list flex:1 child, the skeleton fills the panel top to bottom — no empty
    // gap below the last row on a tall sidebar.
    const { container } = render(<SessionsSkeleton />);
    expect(container.querySelector(".panel.skeleton-panel")).toBeTruthy();
  });
});
