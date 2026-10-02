import { describe, expect, it } from "vitest";
import { injectedTurnKind, isHumanPrompt } from "../turnOrigin";
import type { SessionEntry } from "../types";

/**
 * Fixtures mirror the origin-bearing keys of real Claude Code 2.1.287
 * `user` records (values observed across live transcripts; message text
 * is placeholder). Every combination below occurs on disk.
 */
function userRecord(over: Partial<SessionEntry> & Record<string, unknown>): SessionEntry {
  return {
    parentUuid: "p",
    isSidechain: false,
    type: "user",
    message: { role: "user", content: "placeholder" },
    uuid: "u",
    timestamp: "2026-09-30T10:00:00.000Z",
    userType: "external",
    entrypoint: "cli",
    cwd: "/repo",
    sessionId: "s",
    version: "2.1.287",
    ...over,
  } as SessionEntry;
}

describe("injectedTurnKind", () => {
  it("is null for every human prompt source", () => {
    for (const promptSource of ["typed", "queued", "suggestion_accepted", "sdk"]) {
      expect(
        injectedTurnKind(userRecord({ origin: { kind: "human" }, promptSource, turnOrigin: "human" })),
      ).toBeNull();
    }
  });

  it("is null for a record that predates the origin fields", () => {
    expect(injectedTurnKind(userRecord({}))).toBeNull();
    // 2.1.27x wrote turnOrigin alone on some human prompts.
    expect(injectedTurnKind(userRecord({ turnOrigin: "human" }))).toBeNull();
  });

  it("names task notifications from origin or turnOrigin", () => {
    expect(
      injectedTurnKind(
        userRecord({
          origin: { kind: "task-notification", producer: "session-task" } as { kind: string },
          promptSource: "system",
          turnOrigin: "task_notification",
        }),
      ),
    ).toBe("task-notification");
    expect(injectedTurnKind(userRecord({ turnOrigin: "task_notification" }))).toBe(
      "task-notification",
    );
  });

  it("names a peer message even though it is also isMeta", () => {
    expect(
      injectedTurnKind(
        userRecord({ isMeta: true, origin: { kind: "peer" }, promptSource: "system", turnOrigin: "peer" }),
      ),
    ).toBe("peer");
  });

  it("names channel pushes", () => {
    expect(injectedTurnKind(userRecord({ isMeta: true, origin: { kind: "channel" } }))).toBe(
      "channel",
    );
  });

  it("treats isMeta context and other named kinds as system", () => {
    expect(injectedTurnKind(userRecord({ isMeta: true }))).toBe("system");
    expect(
      injectedTurnKind(userRecord({ isMeta: true, promptSource: "system", turnOrigin: "scheduled" })),
    ).toBe("system");
    expect(injectedTurnKind(userRecord({ origin: { kind: "auto-continuation" } }))).toBe("system");
  });
});

describe("isHumanPrompt", () => {
  it("accepts a typed prompt, string or text+image blocks", () => {
    expect(isHumanPrompt(userRecord({ origin: { kind: "human" } }))).toBe(true);
    expect(
      isHumanPrompt(
        userRecord({
          origin: { kind: "human" },
          message: {
            role: "user",
            content: [{ type: "text", text: "see this" }, { type: "image" }],
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects tool results, injected records, sidechains and assistant turns", () => {
    expect(
      isHumanPrompt(
        userRecord({ message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } }),
      ),
    ).toBe(false);
    expect(isHumanPrompt(userRecord({ origin: { kind: "task-notification" } }))).toBe(false);
    expect(isHumanPrompt(userRecord({ isMeta: true }))).toBe(false);
    expect(isHumanPrompt(userRecord({ isSidechain: true }))).toBe(false);
    expect(isHumanPrompt(userRecord({ message: { role: "assistant", content: "hi" } }))).toBe(false);
  });
});
