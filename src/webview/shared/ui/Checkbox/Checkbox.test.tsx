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

  it("does not flicker: click then a delayed prop echo never reverts the box", () => {
    // Reproduces the real host round-trip: the controlled prop stays at the OLD
    // value for a window (the host re-parses settings.json asynchronously),
    // possibly causing intermediate re-renders, and only LATER echoes the new
    // value back. Throughout, the box must stay on the user's clicked value —
    // no toggle → revert → re-toggle. We record every value the element's
    // `checked` is set to and assert it never dips back to false after the
    // click.
    const writes: boolean[] = [];
    const { container, rerender } = render(<Checkbox checked={false} onChange={() => {}} />);
    const raw = container.querySelector("vscode-checkbox") as HTMLElement & { checked: boolean };
    // Wrap the `checked` setter so we capture every write the wrapper makes.
    let value = raw.checked;
    Object.defineProperty(raw, "checked", {
      configurable: true,
      get: () => value,
      set: (v: boolean) => {
        value = v;
        writes.push(v);
      },
    });

    // User clicks: element flips its own checked, dispatches change.
    raw.checked = true;
    writes.length = 0; // ignore the click's own optimistic write; watch what follows
    fireEvent(raw, new Event("change"));

    // A stray re-render arrives while the prop is STILL the old value (host
    // hasn't echoed). This is the exact moment the old code reverted the box.
    rerender(<Checkbox checked={false} onChange={() => {}} />);
    expect(raw.checked).toBe(true); // box held the user's value
    expect(writes).not.toContain(false); // never written back to false

    // Host finally echoes the new value — a no-op, box already correct.
    rerender(<Checkbox checked={true} onChange={() => {}} />);
    expect(raw.checked).toBe(true);
    expect(writes).not.toContain(false);
  });
});
