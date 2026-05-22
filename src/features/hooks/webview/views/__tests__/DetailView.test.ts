// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { h } from "preact";
import { render, screen, fireEvent, cleanup } from "@testing-library/preact";
import { setVscodeApi } from "../../../../../webview/shared/hooks";
import type { Hook } from "../../../types";
import { resetHooksState, selectedHook } from "../../signals";
import { DetailView } from "../DetailView";

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
  selectedHook.value = hook();
});

afterEach(() => {
  cleanup();
  setVscodeApi(null);
});

describe("DetailView", () => {
  it("renders event, matcher and command", () => {
    render(h(DetailView, { hook: hook() }));
    // "Pre Tool Use" shows in both the title and the Event/Type row.
    expect(screen.getAllByText("Pre Tool Use").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Write").length).toBeGreaterThan(0);
    expect(screen.getByText("echo hi")).toBeTruthy();
  });

  it("back button clears the selection", () => {
    render(h(DetailView, { hook: hook() }));
    fireEvent.click(screen.getByText("Back"));
    expect(selectedHook.value).toBeNull();
  });

  it("posts toggle, delete and open-settings for editable hooks", () => {
    const target = hook();
    render(h(DetailView, { hook: target }));
    fireEvent.click(screen.getByText("Disable"));
    expect(post).toHaveBeenCalledWith({ type: "toggleHookEnabled", hook: target });
    fireEvent.click(screen.getByText("Delete"));
    expect(post).toHaveBeenCalledWith({ type: "deleteHook", hook: target });
    fireEvent.click(screen.getByText("Open settings file"));
    expect(post).toHaveBeenCalledWith({ type: "openSettingsFile", scope: "global" });
  });

  it("copies the command and shows transient feedback", () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(h(DetailView, { hook: hook({ command: "do-thing" }) }));
    fireEvent.click(screen.getByText("Copy command"));
    expect(writeText).toHaveBeenCalledWith("do-thing");
    expect(screen.getByText("Copied!")).toBeTruthy();
  });

  it("edit flow posts updateHook", () => {
    const target = hook();
    render(h(DetailView, { hook: target }));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "new-cmd" } });
    fireEvent.click(screen.getByText("Save"));
    expect(post).toHaveBeenCalledWith({
      type: "updateHook",
      original: target,
      next: { matcher: "Write", command: "new-cmd" },
    });
  });

  it("shows Enable for a disabled hook", () => {
    render(h(DetailView, { hook: hook({ disabled: true }) }));
    expect(screen.getByText("Enable")).toBeTruthy();
    expect(screen.getByText("disabled")).toBeTruthy();
  });

  it("renders read-only note and no mutating actions for plugin hooks", () => {
    render(h(DetailView, { hook: hook({ scope: "plugin", pluginName: "p@p" }) }));
    expect(screen.getByText(/Owned by plugin p@p/)).toBeTruthy();
    expect(screen.queryByText("Delete")).toBeNull();
    expect(screen.queryByText("Edit")).toBeNull();
  });
});
