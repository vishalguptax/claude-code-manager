// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { h } from "preact";
import { CommandSearch } from "../components/CommandSearch";

const base = {
  query: "",
  onQueryChange: () => {},
  onClear: () => {},
  onRefresh: () => {},
};

describe("CommandSearch", () => {
  it("reflects the current query value", () => {
    const { container } = render(h(CommandSearch, { ...base, query: "rev" }));
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("rev");
  });

  it("hides the clear button when the query is empty", () => {
    const { container } = render(h(CommandSearch, base));
    expect(container.querySelector(".search-btn")?.classList.contains("is-hidden")).toBe(true);
  });

  it("shows the clear button when there is a query", () => {
    const { container } = render(h(CommandSearch, { ...base, query: "x" }));
    expect(container.querySelector(".search-btn")?.classList.contains("is-hidden")).toBe(false);
  });

  it("fires onQueryChange as the user types", () => {
    const onQueryChange = vi.fn();
    const { container } = render(h(CommandSearch, { ...base, onQueryChange }));
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "deploy" } });
    expect(onQueryChange).toHaveBeenCalledWith("deploy");
  });

  it("fires onClear on the clear button and on Escape", () => {
    const onClear = vi.fn();
    const { container } = render(h(CommandSearch, { ...base, query: "x", onClear }));
    fireEvent.click(container.querySelector(".search-btn") as Element);
    fireEvent.keyDown(container.querySelector("input") as Element, { key: "Escape" });
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it("fires onRefresh on the refresh button", () => {
    const onRefresh = vi.fn();
    const { container } = render(h(CommandSearch, { ...base, onRefresh }));
    fireEvent.click(container.querySelector(".search-side-btn") as Element);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
