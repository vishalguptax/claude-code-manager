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

/** The matcher field is the shared <TextField> (native <input>). Fire `input`
 * with the new value to simulate typing. */
function setMatcher(el: HTMLInputElement, value: string): void {
  fireEvent.input(el, { target: { value } });
}

describe("EditForm", () => {
  it("prefills matcher and command from the hook", () => {
    const { container } = render(
      h(EditForm, { hook: baseHook, onSave: vi.fn(), onCancel: vi.fn() }),
    );
    const matcher = container.querySelector("input") as HTMLInputElement;
    expect(matcher.value).toBe("Write");
    expect((screen.getByLabelText("Command") as HTMLTextAreaElement).value).toBe("echo hi");
  });

  it("saves trimmed matcher + command", () => {
    const onSave = vi.fn();
    const { container } = render(h(EditForm, { hook: baseHook, onSave, onCancel: vi.fn() }));
    setMatcher(container.querySelector("input") as HTMLInputElement, "  Bash  ");
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "  ls -la  " } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith({ matcher: "Bash", command: "ls -la" });
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

  it("fires onCancel", () => {
    const onCancel = vi.fn();
    render(h(EditForm, { hook: baseHook, onSave: vi.fn(), onCancel }));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
