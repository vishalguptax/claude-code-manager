// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Checkbox } from "../Checkbox";

describe("Checkbox", () => {
  it("renders a native checkbox with the given label", () => {
    const { container, getByText } = render(
      <Checkbox checked={false} onChange={() => {}} label="Enabled" />,
    );
    const el = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute("aria-label")).toBe("Enabled");
    expect(getByText("Enabled")).toBeTruthy();
  });

  it("reflects the checked prop", () => {
    const { container } = render(<Checkbox checked onChange={() => {}} />);
    const el = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(el.checked).toBe(true);
  });

  it("bridges the native change event to onChange with the resolved state", () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox checked={false} onChange={onChange} />);
    const el = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(el);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reflects the disabled prop", () => {
    const { container } = render(<Checkbox checked={false} onChange={() => {}} disabled />);
    const el = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });

  it("follows an external checked change (native controlled binding)", () => {
    const { container, rerender } = render(<Checkbox checked onChange={() => {}} />);
    const el = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(el.checked).toBe(true);
    rerender(<Checkbox checked={false} onChange={() => {}} />);
    expect(el.checked).toBe(false);
  });
});
