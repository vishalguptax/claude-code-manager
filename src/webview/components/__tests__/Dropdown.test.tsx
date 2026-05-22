// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Dropdown, type DropdownOption } from "../Dropdown";

const OPTS: DropdownOption[] = [
  { value: "a", label: "Alpha", badge: 3 },
  { value: "b", label: "Beta", marker: "current" },
];

describe("Dropdown", () => {
  it("registers and renders a vscode-single-select with one option per entry", () => {
    const { container } = render(
      <Dropdown value="a" options={OPTS} onChange={() => {}} ariaLabel="Pick" />,
    );
    const select = container.querySelector('vscode-single-select[aria-label="Pick"]');
    expect(select).toBeTruthy();
    const opts = container.querySelectorAll("vscode-option");
    expect(opts.length).toBe(2);
  });

  it("appends the marker to the option label", () => {
    const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
    const labels = Array.from(container.querySelectorAll("vscode-option")).map((o) =>
      o.textContent?.trim(),
    );
    expect(labels).toContain("Beta (current)");
  });

  it("renders a leading icon when `icon` is given", () => {
    const { container } = render(
      <Dropdown value="a" options={OPTS} onChange={() => {}} icon="git-branch" />,
    );
    expect(container.querySelector('.vsc-dropdown-leading [data-icon="git-branch"]')).toBeTruthy();
  });

  it("omits the leading icon slot when no icon is given", () => {
    const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
    expect(container.querySelector(".vsc-dropdown-leading")).toBeNull();
  });

  it("bridges the element's native change event to onChange with the new value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Dropdown value="a" options={OPTS} onChange={onChange} ariaLabel="Pick" />,
    );
    const select = container.querySelector(
      'vscode-single-select[aria-label="Pick"]',
    ) as HTMLElement;
    // Simulate a real selection: the element resolves `value` to the chosen
    // option before emitting `change`. We spy the existing accessor (rather
    // than redefining the field, which would trip lit's class-field warning)
    // since happy-dom does not run lit's reactive value cycle.
    vi.spyOn(select as unknown as { value: string }, "value", "get").mockReturnValue("b");
    fireEvent(select, new Event("change"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("does not call onChange when the element value matches the controlled value", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Dropdown value="a" options={OPTS} onChange={onChange} ariaLabel="Pick" />,
    );
    const select = container.querySelector(
      'vscode-single-select[aria-label="Pick"]',
    ) as HTMLElement;
    vi.spyOn(select as unknown as { value: string }, "value", "get").mockReturnValue("a");
    fireEvent(select, new Event("change"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
