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
});
