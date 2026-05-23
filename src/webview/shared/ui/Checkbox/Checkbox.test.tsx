// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Checkbox } from "../Checkbox";

describe("Checkbox", () => {
  it("registers and renders a vscode-checkbox with the given label", () => {
    const { container } = render(
      <Checkbox checked={false} onChange={() => {}} label="Enabled" />,
    );
    // The element receives label as a property and mirrors it to aria-label.
    const el = container.querySelector("vscode-checkbox") as HTMLElement & { label: string };
    expect(el).toBeTruthy();
    expect(el.label).toBe("Enabled");
  });

  it("bridges the native change event to onChange with the resolved state", () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked={false} onChange={onChange} />);
    const el = container.querySelector("vscode-checkbox") as HTMLElement;
    vi.spyOn(el as unknown as { checked: boolean }, "checked", "get").mockReturnValue(true);
    fireEvent(el, new Event("change"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects the disabled prop", () => {
    const { container } = render(<Checkbox checked={false} onChange={() => {}} disabled />);
    const el = container.querySelector("vscode-checkbox") as HTMLElement & { disabled: boolean };
    expect(el.disabled).toBe(true);
  });

  it("toggles optimistically: fires onChange and the element reflects checked without a prop update", () => {
    // Mirror the real <vscode-checkbox>: clicking flips its own `checked` and
    // then dispatches `change`. The wrapper must surface that new value and NOT
    // snap the box back while the controlled prop still holds the old value
    // (the host echo arrives asynchronously).
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked={false} onChange={onChange} label="Voice" />);
    const el = container.querySelector("vscode-checkbox") as HTMLElement & { checked: boolean };

    el.checked = true; // element's own optimistic flip on click
    fireEvent(el, new Event("change"));

    expect(onChange).toHaveBeenCalledWith(true);
    // The prop is still false (host hasn't echoed yet) but the element keeps the
    // user's value — the controlled-sync effect must not revert it.
    expect(el.checked).toBe(true);
  });

  it("re-syncs to the prop when an external change disagrees with the element", () => {
    const { container, rerender } = render(<Checkbox checked={true} onChange={() => {}} />);
    const el = container.querySelector("vscode-checkbox") as HTMLElement & { checked: boolean };
    expect(el.checked).toBe(true);
    // A genuine external flip (e.g. switching accounts) updates the prop; the
    // element must follow.
    rerender(<Checkbox checked={false} onChange={() => {}} />);
    expect(el.checked).toBe(false);
  });
});
