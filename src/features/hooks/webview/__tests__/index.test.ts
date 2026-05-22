// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { h } from "preact";
import { render, screen, cleanup, waitFor } from "@testing-library/preact";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { dispatch, _resetMessageBus } from "../../../../webview/shared/model";
import type { Hook } from "../../types";
import { resetHooksState } from "../signals";
import HooksTab from "../index";

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
  _resetMessageBus();
  post = vi.fn();
  setVscodeApi({ postMessage: post });
});

afterEach(() => {
  cleanup();
  setVscodeApi(null);
  _resetMessageBus();
});

describe("HooksTab", () => {
  it("requests hooks on mount and shows the loader first", () => {
    render(h(HooksTab, {}));
    expect(post).toHaveBeenCalledWith({ type: "getHooks" });
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("renders the list once a hooks message arrives via the bus", async () => {
    render(h(HooksTab, {}));
    dispatch({ type: "hooks", data: [hook({ command: "from-host" })] });
    await waitFor(() => expect(screen.getByText("from-host")).toBeTruthy());
    expect(screen.getByText("1 hook")).toBeTruthy();
  });

  it("renders the empty state when the host reports zero hooks", async () => {
    render(h(HooksTab, {}));
    dispatch({ type: "hooks", data: [] });
    await waitFor(() => expect(screen.getByText("No hooks configured")).toBeTruthy());
  });
});
