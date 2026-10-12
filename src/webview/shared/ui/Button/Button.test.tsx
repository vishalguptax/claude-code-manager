// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { Button } from "../Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Hi</Button>);
    expect(screen.getByText("Hi")).toBeTruthy();
  });

  it("renders the label when no children are given", () => {
    render(<Button label="Save" />);
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("invokes onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText("Click"));
    expect(onClick).toHaveBeenCalled();
  });

  it("defaults to the secondary variant", () => {
    const { container } = render(<Button>x</Button>);
    expect(container.querySelector("button")?.classList.contains("btn-secondary")).toBe(true);
  });

  it("applies the requested variant class", () => {
    const { container } = render(<Button variant="danger">Delete</Button>);
    expect(container.querySelector(".btn-danger")).toBeTruthy();
  });

  it("adds the btn-icon class for the icon variant", () => {
    const { container } = render(<Button variant="icon" iconName="copy" ariaLabel="Copy" />);
    const btn = container.querySelector("button");
    expect(btn?.classList.contains("btn-icon")).toBe(true);
    expect(container.querySelector('[data-icon="copy"]')).toBeTruthy();
  });

  it("gives the outlined icon variant the same square geometry", () => {
    // It is `icon` with its reserved border coloured in, so it must keep the
    // sizing and hover class — otherwise the two variants sit a pixel apart
    // in the same toolbar row.
    const { container } = render(
      <Button variant="icon-outline" iconName="filter" ariaLabel="Filter" />,
    );
    const btn = container.querySelector("button");
    expect(btn?.classList.contains("btn-icon")).toBe(true);
    expect(btn?.classList.contains("btn-icon-outline")).toBe(true);
  });

  it("renders a leading icon when iconName is given", () => {
    const { container } = render(<Button iconName="plus">Add</Button>);
    expect(container.querySelector('[data-icon="plus"]')).toBeTruthy();
  });

  it("disables and shows a spinner when loading", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".btn-spinner")).toBeTruthy();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is announced as a toggle when pressed is given, and drawn held while on", () => {
    const { container, rerender } = render(<Button pressed>Preview</Button>);
    const btn = container.querySelector("button")!;
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.classList.contains("is-pressed")).toBe(true);
    rerender(<Button pressed={false}>Preview</Button>);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.classList.contains("is-pressed")).toBe(false);
  });

  it("is a plain action button without pressed", () => {
    const { container } = render(<Button>Go</Button>);
    expect(container.querySelector("button")!.hasAttribute("aria-pressed")).toBe(false);
  });
});
