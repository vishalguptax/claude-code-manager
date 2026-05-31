// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders the title and reflects expanded state", () => {
    render(h(SectionHeader, { id: "usage", title: "Usage", collapsed: false, onToggle: () => {} }));
    const header = screen.getByText("Usage").closest(".acct-section-header") as HTMLElement;
    expect(header.getAttribute("aria-expanded")).toBe("true");
  });

  it("calls onToggle on click and on Enter", () => {
    const onToggle = vi.fn();
    render(h(SectionHeader, { id: "quota", title: "Quota", collapsed: true, onToggle }));
    const header = screen.getByText("Quota").closest(".acct-section-header") as HTMLElement;
    fireEvent.click(header);
    fireEvent.keyDown(header, { key: "Enter" });
    fireEvent.keyDown(header, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(onToggle).toHaveBeenCalledWith("quota");
  });

  it("renders header children (e.g. refresh button)", () => {
    render(
      h(
        SectionHeader,
        { id: "quota", title: "Quota", collapsed: false, onToggle: () => {} },
        h("button", { type: "button" }, "Refresh"),
      ),
    );
    expect(screen.getByText("Refresh")).toBeTruthy();
  });
});
