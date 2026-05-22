// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { h } from "preact";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/preact";
import { setVscodeApi } from "../../../../../webview/shared/hooks";
import type { Hook } from "../../../types";
import { resetHooksState, setHooks, selectedHook } from "../../signals";
import { ListView } from "../ListView";

function hook(partial: Partial<Hook> = {}): Hook {
  return {
    event: "PreToolUse",
    matcher: "Write",
    command: "echo hi",
    scope: "global",
    disabled: false,
    ...partial,
  };
}

let post: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetHooksState();
  post = vi.fn();
  setVscodeApi({ postMessage: post });
});

afterEach(() => {
  cleanup();
  setVscodeApi(null);
});

describe("ListView", () => {
  it("shows the empty state when there are no hooks", () => {
    render(h(ListView, {}));
    expect(screen.getByText("No hooks configured")).toBeTruthy();
  });

  it("renders grouped hooks with a count", () => {
    setHooks([hook({ event: "PreToolUse", command: "a" }), hook({ event: "Stop", command: "b" })]);
    render(h(ListView, {}));
    expect(screen.getByText("2 hooks")).toBeTruthy();
    expect(screen.getByText("Pre Tool Use")).toBeTruthy();
    expect(screen.getByText("Stop")).toBeTruthy();
  });

  it("requests refresh and add via the toolbar buttons", () => {
    render(h(ListView, {}));
    fireEvent.click(screen.getByLabelText("Refresh hooks"));
    expect(post).toHaveBeenCalledWith({ type: "getHooks" });
    fireEvent.click(screen.getByLabelText("Add a new hook"));
    expect(post).toHaveBeenCalledWith({ type: "promptAddHook" });
  });

  it("filters by the debounced search query", async () => {
    setHooks([
      hook({ command: "alpha", matcher: "Write" }),
      hook({ command: "beta", matcher: "Bash" }),
    ]);
    render(h(ListView, {}));
    fireEvent.input(screen.getByLabelText("Search hooks"), { target: { value: "beta" } });
    await waitFor(() => expect(screen.getByText("1 hook")).toBeTruthy());
    expect(screen.queryByText("alpha")).toBeNull();
    expect(screen.getByText("beta")).toBeTruthy();
  });

  it("selects a hook on row click", () => {
    setHooks([hook({ command: "pick-me" })]);
    render(h(ListView, {}));
    fireEvent.click(screen.getByText("pick-me"));
    expect(selectedHook.value?.command).toBe("pick-me");
  });

  it("posts toggle / delete from inline row actions", () => {
    const target = hook({ command: "act" });
    setHooks([target]);
    render(h(ListView, {}));
    fireEvent.click(screen.getByTitle("Disable hook"));
    expect(post).toHaveBeenCalledWith({ type: "toggleHookEnabled", hook: target });
    fireEvent.click(screen.getByTitle("Delete hook"));
    expect(post).toHaveBeenCalledWith({ type: "deleteHook", hook: target });
  });

  it("shows the scope filter and narrows on click", () => {
    setHooks([hook({ scope: "global", command: "g" }), hook({ scope: "local", command: "l" })]);
    render(h(ListView, {}));
    fireEvent.click(screen.getByText("Local (1)"));
    expect(screen.getByText("1 hook")).toBeTruthy();
    expect(screen.queryByText("g")).toBeNull();
  });

  it("renders a windowed list above the virtualize threshold", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      hook({ command: `cmd-${i}`, matcher: `m${i}` }),
    );
    setHooks(many);
    const { container } = render(h(ListView, {}));
    expect(container.querySelector(".hook-virtual-list")).toBeTruthy();
    expect(screen.getByText("60 hooks")).toBeTruthy();
  });
});
