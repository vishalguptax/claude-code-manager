import { beforeEach, describe, expect, it } from "vitest";
import { createPromptsApi } from "../api";

let posted: unknown[];

beforeEach(() => {
  posted = [];
});

function api() {
  return createPromptsApi((m) => posted.push(m));
}

describe("createPromptsApi", () => {
  it("asks for the history with no payload", () => {
    api().getHistory();
    expect(posted).toEqual([{ type: "getPromptHistory" }]);
  });

  it("sends the full prompt text to copy", () => {
    const long = "a".repeat(5000);
    api().copy(long);
    expect(posted).toEqual([{ type: "copyPrompt", text: long }]);
  });

  it("sends the session id to open", () => {
    api().openSession("09285b5a-1542-4940-b2a8-ef73977f6fe1");
    expect(posted).toEqual([
      { type: "openPromptSession", sessionId: "09285b5a-1542-4940-b2a8-ef73977f6fe1" },
    ]);
  });

  it("uses type names outside the config feature's prompt* namespace", () => {
    // The host dispatcher exempts `prompt*` types from its slow-handler
    // tripwire because those are modal dialogs that idle on the user. Reading
    // the history is real work and must stay measurable.
    const sent = api();
    sent.getHistory();
    sent.copy("x");
    sent.openSession("y");
    for (const msg of posted) {
      expect((msg as { type: string }).type.startsWith("prompt")).toBe(false);
    }
  });

  it("posts nothing on construction", () => {
    api();
    expect(posted).toEqual([]);
  });
});
