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
};

/** The matcher field is a <vscode-textfield>; its value lives on the element
 * property. Spy the getter and fire `input` to simulate typing, matching the
 * shared TextField test convention. */
function setMatcher(el: HTMLElement, value: string): void {
  vi.spyOn(el as unknown as { value: string }, "value", "get").mockReturnValue(value);
  fireEvent(el, new Event("input"));
}

describe("EditForm", () => {
  it("prefills matcher and command from the hook", () => {
    const { container } = render(
      h(EditForm, { hook: baseHook, onSave: vi.fn(), onCancel: vi.fn() }),
    );
    const matcher = container.querySelector("vscode-textfield") as HTMLElement & { value: string };
    expect(matcher.value).toBe("Write");
    expect((screen.getByLabelText("Command") as HTMLTextAreaElement).value).toBe("echo hi");
  });

  it("saves trimmed matcher + command", () => {
    const onSave = vi.fn();
    const { container } = render(h(EditForm, { hook: baseHook, onSave, onCancel: vi.fn() }));
    setMatcher(container.querySelector("vscode-textfield") as HTMLElement, "  Bash  ");
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
