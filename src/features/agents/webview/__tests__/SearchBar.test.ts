// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import { SearchBar } from "../components/SearchBar";

describe("SearchBar", () => {
  it("emits typed input", () => {
    const onInput = vi.fn();
    render(h(SearchBar, { value: "", onInput, onRefresh: () => {} }));
    const input = screen.getByPlaceholderText("Search agents...") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "rev" } });
    expect(onInput).toHaveBeenCalledWith("rev");
  });

  it("hides the clear button when value is empty", () => {
    const { container } = render(h(SearchBar, { value: "", onInput: () => {}, onRefresh: () => {} }));
    expect(container.querySelector(".search-btn")?.className).toContain("is-hidden");
  });

  it("shows the clear button when there is a value", () => {
    const { container } = render(
      h(SearchBar, { value: "x", onInput: () => {}, onRefresh: () => {} }),
    );
    expect(container.querySelector(".search-btn")?.className).not.toContain("is-hidden");
  });

  it("clears on the clear button", () => {
    const onInput = vi.fn();
    const { container } = render(h(SearchBar, { value: "x", onInput, onRefresh: () => {} }));
    fireEvent.click(container.querySelector(".search-btn") as Element);
    expect(onInput).toHaveBeenCalledWith("");
  });

  it("clears on Escape", () => {
    const onInput = vi.fn();
    render(h(SearchBar, { value: "x", onInput, onRefresh: () => {} }));
    fireEvent.keyDown(screen.getByPlaceholderText("Search agents..."), { key: "Escape" });
    expect(onInput).toHaveBeenCalledWith("");
  });

  it("fires onRefresh", () => {
    const onRefresh = vi.fn();
    const { container } = render(
      h(SearchBar, { value: "", onInput: () => {}, onRefresh }),
    );
    fireEvent.click(container.querySelector(".search-side-btn") as Element);
    expect(onRefresh).toHaveBeenCalled();
  });
});
