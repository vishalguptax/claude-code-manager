import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { copyPromptToClipboard, openPromptSession } from "../commands";

let writeText: ReturnType<typeof vi.fn>;
let info: ReturnType<typeof vi.fn>;
let error: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn(async () => {});
  info = vi.fn();
  error = vi.fn();
  vi.spyOn(vscode.env.clipboard, "writeText").mockImplementation(writeText);
  vi.spyOn(vscode.window, "showInformationMessage").mockImplementation(info);
  vi.spyOn(vscode.window, "showErrorMessage").mockImplementation(error);
});

describe("copyPromptToClipboard", () => {
  it("writes the full prompt to the clipboard", async () => {
    await copyPromptToClipboard("refactor the parser");
    expect(writeText).toHaveBeenCalledWith("refactor the parser");
  });

  it("confirms with a short excerpt", async () => {
    await copyPromptToClipboard("refactor the parser");
    expect(info).toHaveBeenCalledWith("Copied prompt: refactor the parser");
  });

  it("elides a long prompt in the toast but copies all of it", async () => {
    const long = "a".repeat(200);
    await copyPromptToClipboard(long);
    expect(writeText).toHaveBeenCalledWith(long);
    const message = info.mock.calls[0][0] as string;
    expect(message.endsWith("…")).toBe(true);
    expect(message.length).toBeLessThan(90);
  });

  it("quotes only the first line of a multi-line prompt", async () => {
    await copyPromptToClipboard("first line\nsecond line\nthird");
    expect(info).toHaveBeenCalledWith("Copied prompt: first line");
  });

  it("refuses an empty prompt instead of clearing the clipboard", async () => {
    await copyPromptToClipboard("");
    expect(writeText).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("That prompt has no text to copy.");
  });
});

describe("openPromptSession", () => {
  it("delegates to the supplied resume path", async () => {
    const resume = vi.fn(async () => {});
    await openPromptSession("09285b5a-1542-4940-b2a8-ef73977f6fe1", resume);
    expect(resume).toHaveBeenCalledWith("09285b5a-1542-4940-b2a8-ef73977f6fe1");
  });

  it("does not resume the empty string when the line had no session id", async () => {
    const resume = vi.fn(async () => {});
    await openPromptSession("", resume);
    expect(resume).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "This prompt is not linked to a session — Claude Code recorded it without a session id.",
    );
  });

  it("awaits the resume so the dispatcher's ack lands after it", async () => {
    let settled = false;
    const resume = vi.fn(
      () =>
        new Promise<void>((done) =>
          setTimeout(() => {
            settled = true;
            done();
          }, 0),
        ),
    );
    await openPromptSession("abc", resume);
    expect(settled).toBe(true);
  });
});
