// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import { GroupHeader } from "./GroupHeader";

describe("GroupHeader", () => {
  it("renders the label and the row count", () => {
    const { container } = render(
      h(GroupHeader, { label: "Today", count: 3, collapsed: false, onToggle: () => {} }),
    );
    expect(container.querySelector(".session-group-label")?.textContent).toBe("Today");
    expect(container.querySelector(".session-group-count")?.textContent).toBe("3");
  });

  it("reports its expanded state to assistive tech", () => {
    const expanded = render(
      h(GroupHeader, { label: "Today", count: 1, collapsed: false, onToggle: () => {} }),
    );
    expect(
      expanded.container.querySelector(".session-group-header")?.getAttribute("aria-expanded"),
    ).toBe("true");

    const collapsed = render(
      h(GroupHeader, { label: "Today", count: 1, collapsed: true, onToggle: () => {} }),
    );
    expect(
      collapsed.container.querySelector(".session-group-header")?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("marks the collapsed state with a class so the chevron can rotate", () => {
    const { container } = render(
      h(GroupHeader, { label: "Pinned", count: 9, collapsed: true, onToggle: () => {} }),
    );
    expect(container.querySelector(".session-group-header")?.classList.contains("collapsed")).toBe(
      true,
    );
  });

  it("passes its label to onToggle on click", () => {
    const onToggle = vi.fn();
    const { container } = render(
      h(GroupHeader, { label: "Mon, Sep 7", count: 2, collapsed: false, onToggle }),
    );
    fireEvent.click(container.querySelector(".session-group-header") as Element);
    expect(onToggle).toHaveBeenCalledWith("Mon, Sep 7");
  });

  it("is a button, so Tab reaches it and Space/Enter toggle it natively", () => {
    const { container } = render(
      h(GroupHeader, { label: "Today", count: 1, collapsed: false, onToggle: () => {} }),
    );
    const el = container.querySelector(".session-group-header") as HTMLButtonElement;
    expect(el.tagName).toBe("BUTTON");
    expect(el.type).toBe("button");
  });

  it("names the action it will perform in its tooltip", () => {
    const collapsed = render(
      h(GroupHeader, { label: "Pinned", count: 4, collapsed: true, onToggle: () => {} }),
    );
    expect(
      collapsed.container.querySelector(".session-group-header")?.getAttribute("title"),
    ).toBe("Expand Pinned (4)");

    const expanded = render(
      h(GroupHeader, { label: "Pinned", count: 4, collapsed: false, onToggle: () => {} }),
    );
    expect(
      expanded.container.querySelector(".session-group-header")?.getAttribute("title"),
    ).toBe("Collapse Pinned (4)");
  });
});
