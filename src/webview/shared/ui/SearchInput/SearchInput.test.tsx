// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { SearchInput } from "../SearchInput";

describe("SearchInput", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders a leading search icon", () => {
    const { container } = render(<SearchInput value="" onInput={() => {}} />);
    expect(container.querySelector('.vsc-search-icon [data-icon="search"]')).toBeTruthy();
  });

  it("hides the clear button when empty and shows it when there is text", () => {
    const { container, rerender } = render(<SearchInput value="" onInput={() => {}} />);
    expect(container.querySelector(".vsc-search-clear")).toBeNull();
    rerender(<SearchInput value="hello" onInput={() => {}} />);
    expect(container.querySelector(".vsc-search-clear")).toBeTruthy();
  });

  it("debounces onInput by debounceMs after the last keystroke", () => {
    const onInput = vi.fn();
    const { container } = render(
      <SearchInput value="" onInput={onInput} debounceMs={200} />,
    );
    const el = container.querySelector("vscode-textfield") as HTMLElement;
    vi.spyOn(el as unknown as { value: string }, "value", "get").mockReturnValue("ab");
    fireEvent(el, new Event("input"));
    // Not fired yet — still within the debounce window.
    expect(onInput).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onInput).toHaveBeenCalledExactlyOnceWith("ab");
  });

  it("clears immediately (no debounce) when the clear button is clicked", () => {
    const onInput = vi.fn();
    const { container } = render(
      <SearchInput value="text" onInput={onInput} debounceMs={200} />,
    );
    const clear = container.querySelector(".vsc-search-clear") as HTMLElement;
    fireEvent.click(clear);
    expect(onInput).toHaveBeenCalledExactlyOnceWith("");
  });

  it("emits synchronously when debounceMs is 0", () => {
    const onInput = vi.fn();
    const { container } = render(<SearchInput value="" onInput={onInput} debounceMs={0} />);
    const el = container.querySelector("vscode-textfield") as HTMLElement;
    vi.spyOn(el as unknown as { value: string }, "value", "get").mockReturnValue("z");
    fireEvent(el, new Event("input"));
    expect(onInput).toHaveBeenCalledExactlyOnceWith("z");
  });
});
