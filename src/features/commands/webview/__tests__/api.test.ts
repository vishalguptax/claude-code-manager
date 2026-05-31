import { describe, expect, it } from "vitest";
import { messageSchema } from "../../../../shared/protocol/schemas";
import * as v from "valibot";
import {
  getCommandsMsg,
  launchCommandInChatMsg,
  openCommandFileMsg,
  openUrlMsg,
} from "../api";

/** Every builder must produce a frame that passes the shared valibot schema. */
function assertValid(msg: unknown): void {
  expect(() => v.parse(messageSchema, msg)).not.toThrow();
}

describe("commands api builders", () => {
  it("builds a valid getCommands message", () => {
    const msg = getCommandsMsg();
    expect(msg).toEqual({ type: "getCommands" });
    assertValid(msg);
  });

  it("builds a valid openCommandFile message", () => {
    const msg = openCommandFileMsg("/abs/path/review.md");
    expect(msg).toEqual({ type: "openCommandFile", path: "/abs/path/review.md" });
    assertValid(msg);
  });

  it("builds a valid openUrl message", () => {
    const msg = openUrlMsg("https://example.com");
    expect(msg).toEqual({ type: "openUrl", url: "https://example.com" });
    assertValid(msg);
  });

  it("prefixes the slash command in launchChatWithPrompt", () => {
    const msg = launchCommandInChatMsg("review");
    expect(msg).toEqual({ type: "launchChatWithPrompt", prompt: "/review" });
    assertValid(msg);
  });
});
