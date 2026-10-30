import { describe, it, expect, vi, beforeEach } from "vitest";

const claims = vi.hoisted(() => new Map<string, string>());
vi.mock("../pendingRenames", () => ({
  claimPendingRename: (id: string) => {
    const title = claims.get(id) ?? null;
    claims.delete(id);
    return title;
  },
}));

import { renameHookOutput } from "../renameHook";

beforeEach(() => claims.clear());

describe("renameHookOutput", () => {
  it.each(["UserPromptSubmit", "SessionStart"])(
    "hands a pending rename to Claude Code on %s",
    (event) => {
      claims.set("s1", "Parser rewrite");
      const out = renameHookOutput({ session_id: "s1", hook_event_name: event });
      expect(JSON.parse(out ?? "")).toEqual({
        hookSpecificOutput: { hookEventName: event, sessionTitle: "Parser rewrite" },
      });
      // Claimed: the next prompt says nothing.
      expect(renameHookOutput({ session_id: "s1", hook_event_name: event })).toBeNull();
    },
  );

  it("says nothing without a pending rename", () => {
    expect(renameHookOutput({ session_id: "s1", hook_event_name: "UserPromptSubmit" })).toBeNull();
  });

  it("leaves a rename pending on an event that cannot carry a title", () => {
    claims.set("s1", "Parser rewrite");
    expect(renameHookOutput({ session_id: "s1", hook_event_name: "Stop" })).toBeNull();
    expect(claims.get("s1")).toBe("Parser rewrite");
  });

  it("says nothing for a malformed payload", () => {
    expect(renameHookOutput(null)).toBeNull();
    expect(renameHookOutput({ session_id: 1, hook_event_name: "SessionStart" })).toBeNull();
    expect(renameHookOutput({ session_id: "s1" })).toBeNull();
  });
});
