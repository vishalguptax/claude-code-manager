// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { TextArea } from "../TextArea";

describe("TextArea", () => {
  it("renders a native textarea with the given props", () => {
    const { container } = render(
      <TextArea value="hi" onInput={() => {}} placeholder="Type here" ariaLabel="Field" rows={6} />,
    );
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el).toBeTruthy();
    expect(el.value).toBe("hi");
    expect(el.placeholder).toBe("Type here");
    expect(el.getAttribute("aria-label")).toBe("Field");
    expect(el.getAttribute("rows")).toBe("6");
  });

  it("bridges the native input event to onInput with the current value", () => {
    const onInput = vi.fn();
    const { container } = render(<TextArea value="" onInput={onInput} />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.input(el, { target: { value: "line1\nline2" } });
    expect(onInput).toHaveBeenCalledWith("line1\nline2");
  });

  it("follows an external value change when not focused", () => {
    const { container, rerender } = render(<TextArea value="one" onInput={() => {}} />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.value).toBe("one");
    rerender(<TextArea value="two" onInput={() => {}} />);
    expect(el.value).toBe("two");
  });

  it("ignores external value while focused, then reconciles on blur", () => {
    const { container, rerender } = render(<TextArea value="one" onInput={() => {}} />);
    const el = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.focus(el);
    rerender(<TextArea value="external" onInput={() => {}} />);
    // Focused: the in-flight local value wins over the lagging external echo.
    expect(el.value).toBe("one");
    fireEvent.blur(el);
    expect(el.value).toBe("external");
  });
});
