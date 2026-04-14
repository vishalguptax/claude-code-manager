import { describe, it, expect } from "vitest";
import {
  slugifyProjectPath,
  validatePortableSession,
  rewriteSessionId,
  getKnownProjects,
  defaultExportFilename,
} from "../portable";
import type { Session } from "../types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "67212bf2-aaab-47bf-858a-b9e33a6a96a7",
    name: "",
    project: "claude-manager",
    projectPath: "C:\\Users\\001ch\\OneDrive\\Desktop\\projects\\2026\\claude-manager",
    branch: "main",
    entrypoint: "cli",
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_010_000,
    messageCount: 3,
    summary: "Fix the login bug",
    prompts: ["Fix the login bug"],
    projectKey: "claude-manager",
    searchHaystack: "\nclaude-manager\nmain\nfix the login bug",
    ...overrides,
  };
}

function jsonl(...objs: object[]): string {
  return objs.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

// ─────────────────────────────────────────────────────────────────────
// slugifyProjectPath
// ─────────────────────────────────────────────────────────────────────

describe("slugifyProjectPath", () => {
  it("converts a Windows path with drive letter to the C-- prefix slug", () => {
    expect(slugifyProjectPath("C:\\Users\\001ch\\OneDrive\\Desktop\\projects\\2026\\claude-manager")).toBe(
      "C--Users-001ch-OneDrive-Desktop-projects-2026-claude-manager",
    );
  });

  it("converts a unix path to a leading-dash slug", () => {
    expect(slugifyProjectPath("/home/user/code/foo")).toBe("-home-user-code-foo");
  });

  it("preserves case (Windows directories are mixed-case in practice)", () => {
    expect(slugifyProjectPath("C:\\Users\\Vishal\\Project")).toBe("C--Users-Vishal-Project");
    expect(slugifyProjectPath("c:\\Users\\Vishal\\Project")).toBe("c--Users-Vishal-Project");
  });

  it("handles mixed separators in a single path", () => {
    expect(slugifyProjectPath("C:\\Users/Foo\\Bar/Baz")).toBe("C--Users-Foo-Bar-Baz");
  });

  it("returns empty string for empty input", () => {
    expect(slugifyProjectPath("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────
// validatePortableSession
// ─────────────────────────────────────────────────────────────────────

describe("validatePortableSession", () => {
  it("rejects empty string", () => {
    const r = validatePortableSession("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/empty/i);
  });

  it("rejects whitespace-only", () => {
    const r = validatePortableSession("   \n\n  ");
    expect(r.ok).toBe(false);
  });

  it("rejects malformed JSON anywhere in the file", () => {
    const r = validatePortableSession(`{"sessionId":"abc"}\nnot json\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/malformed/i);
  });

  it("rejects a file with no sessionId field anywhere", () => {
    const r = validatePortableSession(jsonl({ type: "permission" }, { type: "snapshot" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no session id/i);
  });

  it("rejects a session with no user messages", () => {
    const r = validatePortableSession(
      jsonl(
        { sessionId: "abc", type: "permission-mode" },
        { sessionId: "abc", type: "snapshot" },
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no user messages/i);
  });

  it("rejects a file that mixes multiple session ids", () => {
    const r = validatePortableSession(
      jsonl(
        { sessionId: "abc", message: { role: "user", content: "hi" } },
        { sessionId: "xyz", message: { role: "user", content: "yo" } },
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/multiple session ids/i);
  });

  it("accepts a valid file and returns the canonical id", () => {
    const r = validatePortableSession(
      jsonl(
        { sessionId: "abc", type: "permission-mode" },
        { sessionId: "abc", message: { role: "user", content: "hi" } },
        { sessionId: "abc", message: { role: "assistant", content: "hey" } },
        { sessionId: "abc", message: { role: "user", content: "thanks" } },
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sessionId).toBe("abc");
      expect(r.userMessageCount).toBe(2);
      expect(r.lineCount).toBe(4);
    }
  });

  it("ignores blank lines between entries", () => {
    const r = validatePortableSession(
      `{"sessionId":"abc","message":{"role":"user","content":"hi"}}\n\n\n{"sessionId":"abc","type":"snapshot"}\n`,
    );
    expect(r.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// rewriteSessionId
// ─────────────────────────────────────────────────────────────────────

describe("rewriteSessionId", () => {
  it("rewrites top-level sessionId on every line", () => {
    const input = jsonl(
      { sessionId: "old", type: "permission" },
      { sessionId: "old", message: { role: "user", content: "hi" } },
    );
    const out = rewriteSessionId(input, "old", "new");
    const lines = out.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0].sessionId).toBe("new");
    expect(lines[1].sessionId).toBe("new");
  });

  it("does NOT rewrite the old id when it appears inside message content", () => {
    const input = jsonl({
      sessionId: "abc",
      message: { role: "assistant", content: "your session id is abc, do not lose it" },
    });
    const out = rewriteSessionId(input, "abc", "xyz");
    const parsed = JSON.parse(out.trim());
    expect(parsed.sessionId).toBe("xyz");
    // Content must be untouched
    expect(parsed.message.content).toBe("your session id is abc, do not lose it");
  });

  it("preserves blank lines verbatim", () => {
    const input = `{"sessionId":"old","message":{"role":"user","content":"hi"}}\n\n\n{"sessionId":"old","type":"snapshot"}\n`;
    const out = rewriteSessionId(input, "old", "new");
    expect(out.split("\n").length).toBe(input.split("\n").length);
  });

  it("preserves a trailing newline if the source had one", () => {
    const input = `{"sessionId":"old","message":{"role":"user","content":"hi"}}\n`;
    const out = rewriteSessionId(input, "old", "new");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("preserves the absence of a trailing newline if the source had none", () => {
    const input = `{"sessionId":"old","message":{"role":"user","content":"hi"}}`;
    const out = rewriteSessionId(input, "old", "new");
    expect(out.endsWith("\n")).toBe(false);
  });

  it("is a no-op when oldId equals newId", () => {
    const input = jsonl({ sessionId: "same", message: { role: "user", content: "hi" } });
    const out = rewriteSessionId(input, "same", "same");
    expect(out).toBe(input);
  });

  it("leaves lines with no sessionId field unchanged", () => {
    const input = jsonl(
      { other: "field" },
      { sessionId: "old", message: { role: "user", content: "x" } },
    );
    const out = rewriteSessionId(input, "old", "new");
    const lines = out.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ other: "field" });
    expect(lines[1].sessionId).toBe("new");
  });
});

// ─────────────────────────────────────────────────────────────────────
// getKnownProjects
// ─────────────────────────────────────────────────────────────────────

describe("getKnownProjects", () => {
  it("returns deduped {name, path} pairs sorted by name", () => {
    const sessions = [
      makeSession({ id: "1", project: "claude-manager", projectPath: "/home/u/claude-manager" }),
      makeSession({ id: "2", project: "claude-manager", projectPath: "/home/u/claude-manager" }),
      makeSession({ id: "3", project: "Alpha", projectPath: "/home/u/alpha" }),
      makeSession({ id: "4", project: "beta", projectPath: "/home/u/beta" }),
    ];
    const result = getKnownProjects(sessions);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.name)).toEqual(["Alpha", "beta", "claude-manager"]);
  });

  it("dedupes by path, not name (two same-named projects in different parents survive)", () => {
    const sessions = [
      makeSession({ id: "1", project: "foo", projectPath: "/work/foo" }),
      makeSession({ id: "2", project: "foo", projectPath: "/personal/foo" }),
    ];
    const result = getKnownProjects(sessions);
    expect(result).toHaveLength(2);
  });

  it("excludes sessions with no projectPath", () => {
    const sessions = [
      makeSession({ id: "1", projectPath: "" }),
      makeSession({ id: "2", projectPath: "/home/u/proj" }),
    ];
    const result = getKnownProjects(sessions);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for no sessions", () => {
    expect(getKnownProjects([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// defaultExportFilename
// ─────────────────────────────────────────────────────────────────────

describe("defaultExportFilename", () => {
  it("uses the rename when present", () => {
    const f = defaultExportFilename(makeSession({ name: "My Cool Session" }));
    expect(f).toBe("my-cool-session-67212bf2.claude-session.jsonl");
  });

  it("falls back to summary when no rename", () => {
    const f = defaultExportFilename(makeSession({ name: "", summary: "Fix the LOGIN bug!" }));
    expect(f).toBe("fix-the-login-bug-67212bf2.claude-session.jsonl");
  });

  it("falls back to bare short id when name and summary are empty", () => {
    const f = defaultExportFilename(makeSession({ name: "", summary: "" }));
    expect(f).toBe("67212bf2.claude-session.jsonl");
  });

  it("truncates very long names to 40 chars", () => {
    const longName = "A".repeat(120);
    const f = defaultExportFilename(makeSession({ name: longName }));
    const stem = f.replace(".claude-session.jsonl", "");
    // stem = lowercased-truncated-name + "-" + shortId(8)
    expect(stem.length).toBeLessThanOrEqual(40 + 1 + 8);
  });

  it("strips leading and trailing dashes from the stem", () => {
    const f = defaultExportFilename(makeSession({ name: "---weird---" }));
    expect(f).toBe("weird-67212bf2.claude-session.jsonl");
  });
});
