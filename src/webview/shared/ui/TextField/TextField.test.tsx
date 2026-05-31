// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { TextField } from "../TextField";

describe("TextField", () => {
  it("renders a native input with the given props", () => {
    const { container } = render(
      <TextField value="hi" onInput={() => {}} placeholder="Type here" ariaLabel="Field" />,
    );
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el).toBeTruthy();
    expect(el.value).toBe("hi");
    expect(el.placeholder).toBe("Type here");
    expect(el.getAttribute("aria-label")).toBe("Field");
  });

  it("forwards the type prop to the input", () => {
    const { container } = render(<TextField value="" onInput={() => {}} type="search" />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.getAttribute("type")).toBe("search");
  });

  it("bridges the native input event to onInput with the current value", () => {
    const onInput = vi.fn();
    const { container } = render(<TextField value="" onInput={onInput} />);
    const el = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(el, { target: { value: "abc" } });
    expect(onInput).toHaveBeenCalledWith("abc");
  });

  it("renders content-before and content-after when provided", () => {
    const { container } = render(
      <TextField
        value=""
        onInput={() => {}}
        contentBefore={<span data-testid="lead">L</span>}
        contentAfter={<span data-testid="trail">T</span>}
      />,
    );
    expect(container.querySelector('[data-testid="lead"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="trail"]')).toBeTruthy();
  });

  it("renders the controlled value from the prop", () => {
    const { container } = render(<TextField value="seed" onInput={() => {}} />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.value).toBe("seed");
  });

  it("follows an external value change (native controlled binding)", () => {
    const { container, rerender } = render(<TextField value="one" onInput={() => {}} />);
    const el = container.querySelector("input") as HTMLInputElement;
    expect(el.value).toBe("one");
    rerender(<TextField value="two" onInput={() => {}} />);
    expect(el.value).toBe("two");
  });
});
