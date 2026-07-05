// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { h } from "preact";
import { setVscodeApi } from "../../../../../webview/shared/hooks";
import type { Command } from "../../../types";
import { CommandDetailView } from "./CommandDetailView";
import { resetCommandSignals, selected } from "../../model";

function cmd(partial: Partial<Command> & Pick<Command, "name" | "scope">): Command {
  return { content: "", path: "", ...partial };
}

let posted: unknown[];

beforeEach(() => {
  posted = [];
  setVscodeApi({ postMessage: (m) => posted.push(m) });
  resetCommandSignals();
  // navigator.clipboard is a read-only getter in happy-dom; define it.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn() },
    configurable: true,
  });
});

afterEach(() => {
  setVscodeApi(null);
});

describe("CommandDetailView — builtin", () => {
  const builtin = cmd({ name: "clear", scope: "builtin", description: "Clear the conversation" });

  it("renders the title, badge, and description", () => {
    const { container, getByText } = render(h(CommandDetailView, { command: builtin }));
    expect(container.querySelector(".d-title")?.textContent).toBe("/clear");
    expect(container.querySelector(".cmd-scope-builtin")?.textContent).toBe("builtin");
    expect(getByText("Clear the conversation")).toBeTruthy();
  });

  it("posts openUrl when View Docs is clicked", () => {
    const { getByText } = render(h(CommandDetailView, { command: builtin }));
    fireEvent.click(getByText(/View Docs/));
    expect(posted).toContainEqual({
      type: "openUrl",
      url: "https://code.claude.com/docs/en/commands",
    });
  });

  it("posts openUrl when the docs link button is clicked", () => {
    const { getByText } = render(h(CommandDetailView, { command: builtin }));
    fireEvent.click(getByText("https://code.claude.com/docs/en/commands"));
    expect(posted.filter((m) => (m as { type: string }).type === "openUrl")).toHaveLength(1);
  });

  it("copies the slash command to the clipboard", () => {
    const { container } = render(h(CommandDetailView, { command: builtin }));
    const copyBtn = Array.from(container.querySelectorAll(".btn")).find((b) =>
      b.textContent?.includes("Copy"),
    ) as Element;
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/clear");
  });
});

describe("CommandDetailView — custom", () => {
  const custom = cmd({
    name: "review",
    scope: "project",
    path: "/abs/.claude/commands/review.md",
    content: "Please review the diff",
  });

  it("renders the file path and the template content", () => {
    const { container } = render(h(CommandDetailView, { command: custom }));
    expect(container.querySelector(".cmd-detail-path")?.textContent).toContain("review.md");
    expect(container.querySelector(".cmd-detail-pre")?.textContent).toBe("Please review the diff");
  });

  it("posts openCommandFile when Open File is clicked", () => {
    const { getByText } = render(h(CommandDetailView, { command: custom }));
    fireEvent.click(getByText(/Open File/));
    expect(posted).toContainEqual({
      type: "openCommandFile",
      path: "/abs/.claude/commands/review.md",
    });
  });

  it("clears the selection when Back is clicked", () => {
    selected.value = custom;
    const { getByText } = render(h(CommandDetailView, { command: custom }));
    fireEvent.click(getByText(/Back/));
    expect(selected.value).toBeNull();
  });
});
