// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { TextField } from "../TextField";

describe("TextField", () => {
  it("registers and renders a vscode-textfield with the given props", () => {
    const { container } = render(
      <TextField value="hi" onInput={() => {}} placeholder="Type here" ariaLabel="Field" />,
    );
    // The lit element receives placeholder as a property (not a reflected
    // attribute); aria-label is set as an attribute. Assert both at their API.
    const el = container.querySelector("vscode-textfield") as HTMLElement & { placeholder: string };
    expect(el).toBeTruthy();
    expect(el.placeholder).toBe("Type here");
    expect(el.getAttribute("aria-label")).toBe("Field");
  });

  it("bridges the element's native input event to onInput with the resolved value", () => {
    const onInput = vi.fn();
    const { container } = render(<TextField value="" onInput={onInput} />);
    const el = container.querySelector("vscode-textfield") as HTMLElement;
    vi.spyOn(el as unknown as { value: string }, "value", "get").mockReturnValue("abc");
    fireEvent(el, new Event("input"));
    expect(onInput).toHaveBeenCalledWith("abc");
  });

  it("renders slotted content-before and content-after when provided", () => {
    const { container } = render(
      <TextField
        value=""
        onInput={() => {}}
        contentBefore={<span data-testid="lead">L</span>}
        contentAfter={<span data-testid="trail">T</span>}
      />,
    );
    expect(container.querySelector('[slot="content-before"] [data-testid="lead"]')).toBeTruthy();
    expect(container.querySelector('[slot="content-after"] [data-testid="trail"]')).toBeTruthy();
  });

  it("omits both slots when no slotted content is given", () => {
    const { container } = render(<TextField value="" onInput={() => {}} />);
    expect(container.querySelector('[slot="content-before"]')).toBeNull();
    expect(container.querySelector('[slot="content-after"]')).toBeNull();
  });

  it("seeds the element's value from the prop on mount", () => {
    const { container } = render(<TextField value="seed" onInput={() => {}} />);
    const el = container.querySelector("vscode-textfield") as HTMLElement & { value: string };
    expect(el.value).toBe("seed");
  });

  it("re-syncs to the prop when an external change disagrees with the element", () => {
    const { container, rerender } = render(<TextField value="one" onInput={() => {}} />);
    const el = container.querySelector("vscode-textfield") as HTMLElement & { value: string };
    expect(el.value).toBe("one");
    // A genuine external change (account switch, reset) updates the prop; the
    // element must follow.
    rerender(<TextField value="two" onInput={() => {}} />);
    expect(el.value).toBe("two");
  });

  it("does not flicker: typing/clearing then a delayed stale prop echo never reverts the field", () => {
    // Reproduces the real host round-trip: a consumer debounces the host echo,
    // so the controlled `value` prop stays at the OLD value for a window
    // (possibly causing intermediate re-renders) and only LATER echoes the new
    // value back. Throughout, the field must hold the user's in-flight text —
    // no removed → snaps back → removed flicker on clear, no lag on edit. We
    // record every value the wrapper writes to the element and assert it never
    // reverts to a stale prop value after the user typed/cleared.
    const writes: string[] = [];
    const { container, rerender } = render(<TextField value="hello" onInput={() => {}} />);
    const raw = container.querySelector("vscode-textfield") as HTMLElement & { value: string };
    // Wrap the `value` setter so we capture every write the wrapper makes.
    let value = raw.value;
    Object.defineProperty(raw, "value", {
      configurable: true,
      get: () => value,
      set: (v: string) => {
        value = v;
        writes.push(v);
      },
    });

    // User clears the field: the element resolves its own empty value, dispatches input.
    value = "";
    writes.length = 0; // ignore the user's own write; watch what the wrapper does next
    fireEvent(raw, new Event("input"));

    // Stray re-renders arrive while the controlled prop is STILL the old
    // "hello" (the consumer debounces the host round-trip, so the prop has not
    // echoed the clear yet). This is the exact moment the old no-deps effect
    // re-asserted the prop and snapped the text back, producing the flicker.
    rerender(<TextField value="hello" onInput={() => {}} />);
    rerender(<TextField value="hello" onInput={() => {}} />);
    expect(raw.value).toBe(""); // field held the user's cleared value
    expect(writes).not.toContain("hello"); // never reverted to the stale prop

    // Host finally echoes the cleared value — a no-op, field already empty.
    rerender(<TextField value="" onInput={() => {}} />);
    expect(raw.value).toBe("");
    expect(writes).not.toContain("hello");
  });
});
