// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import { GroupHeader } from "./GroupHeader";

describe("GroupHeader", () => {
  it("renders the label and the row count", () => {
    const { container } = render(
      h(GroupHeader, { sectionKey: "Today", label: "Today", count: 3, collapsed: false, onToggle: () => {} }),
    );
    expect(container.querySelector(".session-group-label")?.textContent).toBe("Today");
    expect(container.querySelector(".session-group-count")?.textContent).toBe("3");
  });

  it("reports its expanded state to assistive tech", () => {
    const expanded = render(
      h(GroupHeader, { sectionKey: "Today", label: "Today", count: 1, collapsed: false, onToggle: () => {} }),
    );
    expect(
      expanded.container.querySelector(".session-group-header")?.getAttribute("aria-expanded"),
    ).toBe("true");

    const collapsed = render(
      h(GroupHeader, { sectionKey: "Today", label: "Today", count: 1, collapsed: true, onToggle: () => {} }),
    );
    expect(
      collapsed.container.querySelector(".session-group-header")?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("marks the collapsed state with a class so the chevron can rotate", () => {
    const { container } = render(
      h(GroupHeader, { sectionKey: "Pinned", label: "Pinned", count: 9, collapsed: true, onToggle: () => {} }),
    );
    expect(container.querySelector(".session-group-header")?.classList.contains("collapsed")).toBe(
      true,
    );
  });

  it("passes its section key, not its label, to onToggle on click", () => {
    const onToggle = vi.fn();
    const { container } = render(
      h(GroupHeader, { sectionKey: "folder:Today", label: "Today", count: 2, collapsed: false, onToggle }),
    );
    fireEvent.click(container.querySelector(".session-group-header") as Element);
    expect(onToggle).toHaveBeenCalledWith("folder:Today");
  });

  it("is a button, so Tab reaches it and Space/Enter toggle it natively", () => {
    const { container } = render(
      h(GroupHeader, { sectionKey: "Today", label: "Today", count: 1, collapsed: false, onToggle: () => {} }),
    );
    const el = container.querySelector(".session-group-header") as HTMLButtonElement;
    expect(el.tagName).toBe("BUTTON");
    expect(el.type).toBe("button");
  });

  it("names the action it will perform in its tooltip", () => {
    const collapsed = render(
      h(GroupHeader, { sectionKey: "Pinned", label: "Pinned", count: 4, collapsed: true, onToggle: () => {} }),
    );
    expect(
      collapsed.container.querySelector(".session-group-header")?.getAttribute("title"),
    ).toBe("Expand Pinned (4)");

    const expanded = render(
      h(GroupHeader, { sectionKey: "Pinned", label: "Pinned", count: 4, collapsed: false, onToggle: () => {} }),
    );
    expect(
      expanded.container.querySelector(".session-group-header")?.getAttribute("title"),
    ).toBe("Collapse Pinned (4)");
  });

  it("leaves the native context menu alone on a date section", () => {
    const { container } = render(
      h(GroupHeader, { sectionKey: "Today", label: "Today", count: 1, collapsed: false, onToggle: () => {} }),
    );
    expect(container.querySelector(".session-group-icon")).toBeNull();
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    container.querySelector(".session-group-header")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("shows a folder icon and opens the folder menu on right-click", () => {
    const onFolderMenu = vi.fn();
    const onToggle = vi.fn();
    const { container } = render(
      h(GroupHeader, {
        sectionKey: "folder:auth",
        label: "auth",
        count: 2,
        collapsed: false,
        onToggle,
        onFolderMenu,
      }),
    );
    expect(container.querySelector(".session-group-icon")).not.toBeNull();
    const header = container.querySelector(".session-group-header")!;
    expect(header.getAttribute("title")).toContain("right-click to rename or remove");
    fireEvent.contextMenu(header, { clientX: 12, clientY: 34 });
    expect(onFolderMenu).toHaveBeenCalledWith(12, 34);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
