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
});
