// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { BackButton } from "../BackButton";

describe("BackButton", () => {
  it("renders a chromeless button with the arrow icon and default label", () => {
    const { container, getByText } = render(<BackButton onClick={() => {}} />);
    const btn = container.querySelector("button.back-btn") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.type).toBe("button");
    expect(btn.querySelector("svg")).toBeTruthy();
    expect(getByText("Back")).toBeTruthy();
  });

  it("does NOT carry the .btn / .btn-icon chrome that clipped the label", () => {
    const { container } = render(<BackButton onClick={() => {}} />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.classList.contains("btn")).toBe(false);
    expect(btn.classList.contains("btn-icon")).toBe(false);
  });

  it("renders a custom label when provided", () => {
    const { getByText } = render(<BackButton onClick={() => {}} label="All sessions" />);
    expect(getByText("All sessions")).toBeTruthy();
  });

  it("appends an extra class alongside .back-btn", () => {
    const { container } = render(<BackButton onClick={() => {}} class="extra" />);
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.classList.contains("back-btn")).toBe(true);
    expect(btn.classList.contains("extra")).toBe(true);
  });

  it("fires onClick when pressed", () => {
    const onClick = vi.fn();
    const { container } = render(<BackButton onClick={onClick} />);
    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
