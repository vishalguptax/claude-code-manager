// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/preact";
import { ShowMore } from "./ShowMore";

describe("ShowMore", () => {
  it("counts the hidden remainder, not the total", () => {
    render(<ShowMore total={48} threshold={6} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText("Show 42 more")).toBeTruthy();
  });

  it("names what is hidden when given a noun", () => {
    render(
      <ShowMore total={48} threshold={6} expanded={false} onToggle={() => {}} noun="patterns" />,
    );
    expect(screen.getByText("Show 42 more patterns")).toBeTruthy();
  });

  // The regression this signature exists to prevent: an earlier version took
  // the rendered count, which equals `total` once expanded, so "Show less"
  // could never render and an expanded list had no way back.
  it("offers Show less once expanded", () => {
    render(<ShowMore total={48} threshold={6} expanded onToggle={() => {}} />);
    expect(screen.getByText("Show less")).toBeTruthy();
  });

  it("renders nothing when the list is shorter than its threshold", () => {
    const { container } = render(
      <ShowMore total={4} threshold={6} expanded={false} onToggle={() => {}} />,
    );
    expect(container.querySelector(".show-more")).toBeNull();
  });

  it("renders nothing when the list exactly fills the threshold", () => {
    const { container } = render(
      <ShowMore total={6} threshold={6} expanded={false} onToggle={() => {}} />,
    );
    expect(container.querySelector(".show-more")).toBeNull();
  });

  it("reports the state the caller should move to", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <ShowMore total={48} threshold={6} expanded={false} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByText("Show 42 more"));
    expect(onToggle).toHaveBeenLastCalledWith(true);

    rerender(<ShowMore total={48} threshold={6} expanded onToggle={onToggle} />);
    fireEvent.click(screen.getByText("Show less"));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });
});
