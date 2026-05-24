// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Input } from "../Input";
import { TextField } from "../TextField";

describe("Input (TextField alias)", () => {
  it("is the same component as TextField after the A2 consolidation", () => {
    expect(Input).toBe(TextField);
  });

  it("invokes onInput with the new value", () => {
    const onInput = vi.fn();
    const { container } = render(<Input value="" onInput={onInput} />);
    const el = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(el, { target: { value: "hi" } });
    expect(onInput).toHaveBeenCalledWith("hi");
  });
});
