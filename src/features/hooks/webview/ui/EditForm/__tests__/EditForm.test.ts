// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { h } from "preact";
import { render, screen, fireEvent } from "@testing-library/preact";
import type { Hook } from "../../../../types";
import { EditForm } from "../EditForm";

const baseHook: Hook = {
  event: "PreToolUse",
  matcher: "Write",
  command: "echo hi",
  scope: "global",
  disabled: false,
  hookType: "command",
  entryIndex: 0,
  commandIndex: null,
};

describe("EditForm", () => {
  it("prefills matcher and command from the hook", () => {
    render(h(EditForm, { hook: baseHook, onSave: vi.fn(), onCancel: vi.fn() }));
    expect((screen.getByLabelText("Matcher") as HTMLInputElement).value).toBe("Write");
    expect((screen.getByLabelText("Command") as HTMLTextAreaElement).value).toBe("echo hi");
  });

  it("saves matcher + command with the hook's current event/scope and no timeout", () => {
    const onSave = vi.fn();
    render(h(EditForm, { hook: baseHook, onSave, onCancel: vi.fn() }));
    fireEvent.input(screen.getByLabelText("Matcher"), { target: { value: "  Bash  " } });
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "  ls -la  " } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith({
      matcher: "Bash",
      command: "ls -la",
      event: "PreToolUse",
      scope: "global",
      timeout: undefined,
    });
  });

  it("sends a numeric timeout when the field is filled", () => {
    const onSave = vi.fn();
    render(h(EditForm, { hook: baseHook, onSave, onCancel: vi.fn() }));
    fireEvent.input(screen.getByLabelText("Timeout in seconds"), { target: { value: "45" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timeout: 45 }));
  });

  it("blocks save on a non-numeric or zero timeout", () => {
    const onSave = vi.fn();
    render(h(EditForm, { hook: baseHook, onSave, onCancel: vi.fn() }));
    const save = screen.getByText("Save").closest("button") as HTMLButtonElement;
    fireEvent.input(screen.getByLabelText("Timeout in seconds"), { target: { value: "abc" } });
    expect(screen.getByText(/positive whole number/)).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Timeout in seconds"), { target: { value: "0" } });
    expect(save.disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Timeout in seconds"), { target: { value: "30" } });
    expect(save.disabled).toBe(false);
  });

  it("disables save when the command is empty", () => {
    const onSave = vi.fn();
    render(h(EditForm, { hook: baseHook, onSave, onCancel: vi.fn() }));
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "   " } });
    const save = screen.getByText("Save").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("round-trips a SessionStart matcher unchanged and names what it matches", () => {
    // Regression: the form used to treat SessionStart as matcher-less, so
    // saving blanked "compact" and the hook then fired on every session start.
    const onSave = vi.fn();
    const hook: Hook = { ...baseHook, event: "SessionStart", matcher: "compact" };
    render(h(EditForm, { hook, onSave, onCancel: vi.fn() }));
    const field = screen.getByLabelText("Matcher") as HTMLInputElement;
    expect(field.value).toBe("compact");
    expect(field.placeholder).toBe("Source: startup|resume|clear|compact|fork (blank = match all)");
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ matcher: "compact", event: "SessionStart" }),
    );
  });

  it("keeps the tool-name placeholder for tool events", () => {
    render(h(EditForm, { hook: baseHook, onSave: vi.fn(), onCancel: vi.fn() }));
    expect((screen.getByLabelText("Matcher") as HTMLInputElement).placeholder).toBe(
      "Tool name or pattern (blank = match all)",
    );
    expect(screen.queryByText(/ignores the matcher/)).toBeNull();
  });

  it("preserves an existing matcher on an event this catalog doesn't know", () => {
    // Defence in depth: a newer CLI may match on events not listed yet.
    const onSave = vi.fn();
    const hook: Hook = { ...baseHook, event: "SomeFutureEvent", matcher: "beta" };
    render(h(EditForm, { hook, onSave, onCancel: vi.fn() }));
    expect((screen.getByLabelText("Matcher") as HTMLInputElement).value).toBe("beta");
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ matcher: "beta" }));
  });

  it("hides the Matcher field for a blank-matcher hook on an unmatched event", () => {
    const onSave = vi.fn();
    render(h(EditForm, { hook: { ...baseHook, event: "Stop", matcher: "" }, onSave, onCancel: vi.fn() }));
    expect(screen.queryByLabelText("Matcher")).toBeNull();
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ matcher: "", event: "Stop" }));
  });

  it("keeps an existing matcher visible, with a note, when re-homing to an unmatched event", () => {
    const onSave = vi.fn();
    render(h(EditForm, { hook: baseHook, onSave, onCancel: vi.fn() }));
    fireEvent.click(screen.getByLabelText("Event"));
    fireEvent.click(screen.getByText("Stop"));
    expect((screen.getByLabelText("Matcher") as HTMLInputElement).value).toBe("Write");
    expect(screen.getByText("Claude Code ignores the matcher for this event.")).toBeTruthy();
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ matcher: "Write", event: "Stop" }));
  });

  it("drops a matcher typed into a blank-matcher hook when re-homing to an unmatched event", () => {
    const onSave = vi.fn();
    render(h(EditForm, { hook: { ...baseHook, matcher: "" }, onSave, onCancel: vi.fn() }));
    fireEvent.input(screen.getByLabelText("Matcher"), { target: { value: "Bash" } });
    fireEvent.click(screen.getByLabelText("Event"));
    fireEvent.click(screen.getByText("Stop"));
    expect(screen.queryByLabelText("Matcher")).toBeNull();
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ matcher: "", event: "Stop" }));
  });

  it("fires onCancel", () => {
    const onCancel = vi.fn();
    render(h(EditForm, { hook: baseHook, onSave: vi.fn(), onCancel }));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
