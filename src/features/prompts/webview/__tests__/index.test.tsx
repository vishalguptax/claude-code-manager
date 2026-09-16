// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Message } from "../../../../shared/protocol/schemas";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../../webview/shared/model";
import type { PromptEntry } from "../../types";
import { resetPromptSignals } from "../model";
import PromptsTab from "../index";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";

function entry(over: Partial<PromptEntry> = {}): PromptEntry {
  return {
    id: "s#0",
    text: "refactor the session parser",
    timestamp: Date.now() - 60_000,
    projectPath: "/Users/vishal/WORK/claude-code-manager",
    projectName: "claude-code-manager",
    sessionId: SESSION,
    repeatCount: 1,
    attachmentCount: 0,
    attachmentChars: 0,
    ...over,
  };
}

/**
 * Deliver a host message through the real bus fan-out.
 *
 * Cast because the `promptHistory` variant is not in the shared protocol
 * union yet — see the note in `webview/index.tsx`. `dispatch` is the same
 * function `initMessageBus` calls after validation.
 */
function send(msg: { type: string } & Record<string, unknown>): void {
  dispatch(msg as unknown as Message);
}

let posted: unknown[];

beforeEach(() => {
  posted = [];
  setVscodeApi({ postMessage: (m) => posted.push(m) });
  _resetMessageBus();
  resetPromptSignals();
});

afterEach(() => {
  cleanup();
  setVscodeApi(null);
});

describe("PromptsTab", () => {
  it("requests the history once on mount", () => {
    render(<PromptsTab />);
    expect(posted).toEqual([{ type: "getPromptHistory" }]);
  });

  it("shows a skeleton until the first reply lands", () => {
    const { container } = render(<PromptsTab />);
    const skeleton = container.querySelector(".skeleton-panel");
    expect(skeleton).toBeTruthy();
    // Announced as busy, not as an empty list — the user is waiting, not done.
    expect(skeleton?.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("No prompt history yet")).toBeNull();
  });

  it("renders the prompts the host sent", async () => {
    render(<PromptsTab />);
    send({ type: "promptHistory", data: [entry({ text: "stream the history file" })] });
    await waitFor(() => expect(screen.getByText("stream the history file")).toBeTruthy());
  });

  it("renders the empty state for a history with no prompts", async () => {
    render(<PromptsTab />);
    send({ type: "promptHistory", data: [] });
    await waitFor(() => expect(screen.getByText("No prompt history yet")).toBeTruthy());
  });

  it("tolerates a reply with no data array", async () => {
    render(<PromptsTab />);
    send({ type: "promptHistory" });
    await waitFor(() => expect(screen.getByText("No prompt history yet")).toBeTruthy());
  });

  it("ignores the config feature's prompt* dialog messages", async () => {
    // The bus fans out by prefix. This tab listens on "promptHistory"
    // precisely so `promptAddHook` and friends never reach it — if the prefix
    // is ever shortened to "prompt", this case fails.
    render(<PromptsTab />);
    send({ type: "promptHistory", data: [entry()] });
    await waitFor(() => expect(screen.getByText("refactor the session parser")).toBeTruthy());

    send({ type: "promptAddHook" });
    send({ type: "promptCustomModel" });
    expect(screen.getByText("refactor the session parser")).toBeTruthy();
  });

  it("surfaces a host error", async () => {
    render(<PromptsTab />);
    send({ type: "error", message: "history.jsonl is unreadable" });
    await waitFor(() => expect(screen.getByText("history.jsonl is unreadable")).toBeTruthy());
  });

  it("asks the host to copy a prompt", async () => {
    render(<PromptsTab />);
    send({ type: "promptHistory", data: [entry({ text: "copy this one" })] });
    await waitFor(() => expect(screen.getByTitle("Copy prompt")).toBeTruthy());

    fireEvent.click(screen.getByTitle("Copy prompt"));
    expect(posted).toContainEqual({ type: "copyPrompt", text: "copy this one" });
  });

  it("asks the host to open the session a prompt belongs to", async () => {
    render(<PromptsTab />);
    send({ type: "promptHistory", data: [entry()] });
    await waitFor(() =>
      expect(screen.getByTitle("Open the session this prompt was typed in")).toBeTruthy(),
    );

    fireEvent.click(screen.getByTitle("Open the session this prompt was typed in"));
    expect(posted).toContainEqual({ type: "openPromptSession", sessionId: SESSION });
  });

  it("stops listening after unmount so a remount does not double-handle", async () => {
    const view = render(<PromptsTab />);
    send({ type: "promptHistory", data: [entry()] });
    await waitFor(() => expect(screen.getByText("refactor the session parser")).toBeTruthy());

    view.unmount();
    // No handler is registered now: this must not throw, and must not update
    // anything that a later mount would then render stale.
    expect(() => send({ type: "promptHistory", data: [entry({ text: "after unmount" })] })).not.toThrow();
  });
});
