// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/preact";
import { ReloadButton } from "./ReloadButton";
import { setVscodeApi } from "../../../shared/hooks";
import { _resetMessageBus, dispatch } from "../../../shared/model";

describe("ReloadButton", () => {
  beforeEach(() => {
    _resetMessageBus();
    setVscodeApi(null);
  });

  it("renders a global reload icon button with an accessible label", () => {
    const { container } = render(<ReloadButton />);
    const btn = container.querySelector("button.tab-reload-btn");
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute("aria-label")).toBe("Reload (data + view)");
    expect(btn?.getAttribute("title")).toBe("Reload (data + view)");
  });

  it("posts a global reloadAll message on click", () => {
    const posted: unknown[] = [];
    setVscodeApi({ postMessage: (m) => posted.push(m) });
    const { container } = render(<ReloadButton />);
    fireEvent.click(container.querySelector("button.tab-reload-btn") as HTMLButtonElement);
    expect(posted).toEqual([{ type: "reloadAll" }]);
  });

  it("spins while reloading and stops on reloadComplete", () => {
    setVscodeApi({ postMessage: () => {} });
    const { container } = render(<ReloadButton />);
    const btn = container.querySelector("button.tab-reload-btn") as HTMLButtonElement;

    fireEvent.click(btn);
    // The shared Button marks loading state with `is-loading` + aria-busy.
    expect(btn.classList.contains("is-loading")).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");

    // The host's reloadComplete drops the spinner (belt-and-suspenders for
    // the brief window before the webview is re-mounted with fresh html).
    // Wrapped in act() so the Preact state update flushes before we assert.
    act(() => dispatch({ type: "reloadComplete" }));
    expect(btn.classList.contains("is-loading")).toBe(false);
  });
});
