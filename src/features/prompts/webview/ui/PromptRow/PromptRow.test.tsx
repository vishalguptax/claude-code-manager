// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import type { PromptEntry } from "../../../types";
import { PromptRow } from "./PromptRow";

function entry(over: Partial<PromptEntry> = {}): PromptEntry {
  return {
    id: "09285b5a#12",
    text: "refactor the session parser to stream the history file",
    timestamp: Date.now() - 60_000,
    projectPath: "/Users/vishal/WORK/claude-code-manager",
    projectName: "claude-code-manager",
    sessionId: "09285b5a-1542-4940-b2a8-ef73977f6fe1",
    repeatCount: 1,
    attachmentCount: 0,
    attachmentChars: 0,
    ...over,
  };
}

const OPEN_TITLE = "Open the session this prompt was typed in";

afterEach(cleanup);

describe("PromptRow", () => {
  it("renders the prompt text in full", () => {
    render(<PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={vi.fn()} />);
    expect(
      screen.getByText("refactor the session parser to stream the history file"),
    ).toBeTruthy();
  });

  it("uses the shared row vocabulary so it matches every other list tab", () => {
    // `.item` is what carries the row inset, hover, focus ring AND the density
    // setting (density.css targets it). A private row class would silently opt
    // this tab out of all four.
    const { container } = render(
      <PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    const row = container.querySelector(".prompt-item");
    expect(row?.classList.contains("item")).toBe(true);
    expect(row?.querySelector(".item-row1")).toBeTruthy();
    expect(row?.querySelector(".item-name")).toBeTruthy();
  });

  it("keeps the whole prompt in the title so clamping never hides it", () => {
    const long = "a".repeat(4000);
    const { container } = render(
      <PromptRow entry={entry({ text: long })} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    // Clamping is CSS-only; a later "simplification" to a JS slice would lose
    // the full text, and this pins it.
    expect(container.querySelector(".item-name")?.getAttribute("title")).toBe(long);
  });

  it("shows the project name, with the full path as its tooltip", () => {
    const { container } = render(
      <PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    const project = container.querySelector(".tag.folder");
    expect(project?.textContent).toBe("claude-code-manager");
    expect(project?.getAttribute("title")).toBe("/Users/vishal/WORK/claude-code-manager");
  });

  it("omits the project when the line recorded none", () => {
    const { container } = render(
      <PromptRow
        entry={entry({ projectName: "", projectPath: "" })}
        onCopy={vi.fn()}
        onOpenSession={vi.fn()}
      />,
    );
    expect(container.querySelector(".tag.folder")).toBeNull();
  });

  it("omits the time when the line recorded no timestamp", () => {
    const { container } = render(
      <PromptRow entry={entry({ timestamp: 0 })} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    expect(container.querySelector(".item-time")).toBeNull();
  });

  it("shows a repeat count for a collapsed run", () => {
    const { container } = render(
      <PromptRow entry={entry({ repeatCount: 5 })} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    const repeat = container.querySelector(".vsc-badge");
    expect(repeat?.textContent).toBe("×5");
    expect(repeat?.getAttribute("title")).toBe("Sent 5 times in a row");
  });

  it("shows no repeat badge for a single send", () => {
    const { container } = render(
      <PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    expect(container.querySelector(".vsc-badge")).toBeNull();
  });

  it("shows an attachment count and its size, never the blob", () => {
    const { container } = render(
      <PromptRow
        entry={entry({ attachmentCount: 2, attachmentChars: 200_000 })}
        onCopy={vi.fn()}
        onOpenSession={vi.fn()}
      />,
    );
    const badge = container.querySelector(".tag:not(.folder)");
    expect(badge?.textContent).toContain("2");
    expect(badge?.getAttribute("title")).toContain("200000 characters");
  });

  it("omits the attachment badge when there are none", () => {
    const { container } = render(
      <PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    expect(container.querySelector(".tag:not(.folder)")).toBeNull();
  });

  it("copies the full prompt text, not the clamped display", () => {
    const onCopy = vi.fn();
    const long = "b".repeat(3000);
    render(<PromptRow entry={entry({ text: long })} onCopy={onCopy} onOpenSession={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Copy prompt"));
    expect(onCopy).toHaveBeenCalledWith(long);
  });

  it("opens the session the prompt belongs to when the row is clicked", () => {
    const onOpenSession = vi.fn();
    render(<PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={onOpenSession} />);
    fireEvent.click(screen.getByTitle(OPEN_TITLE));
    expect(onOpenSession).toHaveBeenCalledWith("09285b5a-1542-4940-b2a8-ef73977f6fe1");
  });

  it("opens the session from the keyboard", () => {
    const onOpenSession = vi.fn();
    render(<PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={onOpenSession} />);
    fireEvent.keyDown(screen.getByTitle(OPEN_TITLE), { key: "Enter" });
    expect(onOpenSession).toHaveBeenCalledWith("09285b5a-1542-4940-b2a8-ef73977f6fe1");
  });

  it("does not fire the row action when the copy button is activated by Space", () => {
    const onOpenSession = vi.fn();
    render(<PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={onOpenSession} />);
    fireEvent.keyDown(screen.getByTitle("Copy prompt"), { key: " " });
    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it("is inert when there is no session to open", () => {
    const { container } = render(
      <PromptRow entry={entry({ sessionId: "" })} onCopy={vi.fn()} onOpenSession={vi.fn()} />,
    );
    const row = container.querySelector(".prompt-item");
    expect(row?.getAttribute("role")).toBeNull();
    expect(row?.getAttribute("tabindex")).toBeNull();
    expect(screen.queryByTitle(OPEN_TITLE)).toBeNull();
  });

  it("names the row and the icon-only action for screen readers", () => {
    // CSS hides the copy action until hover; the accessible name has to come
    // from an attribute that is never hidden, so assert the attribute itself.
    render(<PromptRow entry={entry()} onCopy={vi.fn()} onOpenSession={vi.fn()} />);
    expect(screen.getByLabelText(/^Copy prompt: refactor the session/)).toBeTruthy();
    expect(
      screen.getByLabelText(/^Open the session for prompt: refactor the session/),
    ).toBeTruthy();
  });
});
