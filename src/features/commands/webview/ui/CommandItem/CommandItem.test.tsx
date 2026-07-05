// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { h } from "preact";
import type { Command } from "../../../types";
import { CommandItem } from "./CommandItem";

function cmd(partial: Partial<Command> & Pick<Command, "name" | "scope">): Command {
  return { content: "", path: "", ...partial };
}

const noop = () => {};

describe("CommandItem", () => {
  it("renders the command name with a leading slash and a scope badge", () => {
    const { container } = render(
      h(CommandItem, {
        command: cmd({ name: "review", scope: "project", content: "do it" }),
        active: false,
        showChatButton: false,
        onSelect: noop,
        onCopy: noop,
        onLaunchChat: noop,
      }),
    );
    expect(container.querySelector(".cmd-item-name")?.textContent).toBe("/review");
    expect(container.querySelector(".cmd-scope-project")?.textContent).toBe("project");
  });

  it("uses the description as the preview for builtin commands and truncates long text", () => {
    const long = "x".repeat(200);
    const { container } = render(
      h(CommandItem, {
        command: cmd({ name: "clear", scope: "builtin", description: long }),
        active: false,
        showChatButton: false,
        onSelect: noop,
        onCopy: noop,
        onLaunchChat: noop,
      }),
    );
    const preview = container.querySelector(".cmd-item-preview")?.textContent ?? "";
    expect(preview.endsWith("...")).toBe(true);
    expect(preview.length).toBe(83); // 80 chars + "..."
  });

  it("marks the active row", () => {
    const { container } = render(
      h(CommandItem, {
        command: cmd({ name: "a", scope: "global" }),
        active: true,
        showChatButton: false,
        onSelect: noop,
        onCopy: noop,
        onLaunchChat: noop,
      }),
    );
    expect(container.querySelector(".cmd-item")?.classList.contains("active")).toBe(true);
  });

  it("fires onSelect when the row is clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(
      h(CommandItem, {
        command: cmd({ name: "a", scope: "global" }),
        active: false,
        showChatButton: false,
        onSelect,
        onCopy: noop,
        onLaunchChat: noop,
      }),
    );
    fireEvent.click(container.querySelector(".cmd-item") as Element);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("opens on Enter / Space (row is keyboard-operable)", () => {
    const onSelect = vi.fn();
    const { container } = render(
      h(CommandItem, {
        command: cmd({ name: "a", scope: "global" }),
        active: false,
        showChatButton: false,
        onSelect,
        onCopy: noop,
        onLaunchChat: noop,
      }),
    );
    const row = container.querySelector(".cmd-item") as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("copy button fires onCopy and stops propagation to the row", () => {
    const onSelect = vi.fn();
    const onCopy = vi.fn();
    const { container } = render(
      h(CommandItem, {
        command: cmd({ name: "a", scope: "global" }),
        active: false,
        showChatButton: false,
        onSelect,
        onCopy,
        onLaunchChat: noop,
      }),
    );
    fireEvent.click(container.querySelector(".item-copy-btn") as Element);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("hides the chat button unless showChatButton is true", () => {
    const onLaunchChat = vi.fn();
    const hidden = render(
      h(CommandItem, {
        command: cmd({ name: "a", scope: "global" }),
        active: false,
        showChatButton: false,
        onSelect: noop,
        onCopy: noop,
        onLaunchChat,
      }),
    );
    expect(hidden.container.querySelector(".item-chat-btn")).toBeNull();

    const shown = render(
      h(CommandItem, {
        command: cmd({ name: "a", scope: "global" }),
        active: false,
        showChatButton: true,
        onSelect: noop,
        onCopy: noop,
        onLaunchChat,
      }),
    );
    fireEvent.click(shown.container.querySelector(".item-chat-btn") as Element);
    expect(onLaunchChat).toHaveBeenCalledTimes(1);
  });
});
