import { describe, it, expect } from "vitest";
import {
  slugifyProjectPath,
  deslugifyProjectPath,
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

// A path whose sanitized form is exactly MAX_SLUG_LENGTH (200) characters:
// the leading "/" becomes "-", then 199 more characters.
const SANITIZED_200 = "/" + "a".repeat(199);
// One character longer — the first input that the CLI truncates.
const SANITIZED_201 = "/" + "a".repeat(200);

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

  it("keeps the doubled dash and the case of a Windows drive letter", () => {
    expect(slugifyProjectPath("C:\\Users\\x")).toBe("C--Users-x");
    expect(slugifyProjectPath("c:\\Users\\x")).toBe("c--Users-x");
  });

  it("collapses the dot of a hidden directory (real dir under ~/.claude/projects)", () => {
    expect(
      slugifyProjectPath(
        "/Users/vishal/WORK/BINARYVEDA/keus-iot-platform/.claude-worktrees/ops-fe-fixes",
      ),
    ).toBe("-Users-vishal-WORK-BINARYVEDA-keus-iot-platform--claude-worktrees-ops-fe-fixes");
  });

  it("collapses spaces, parentheses, underscores, + and @", () => {
    expect(slugifyProjectPath("/Users/vishal/Dropbox (Personal)/my_project+v2/@scope")).toBe(
      "-Users-vishal-Dropbox--Personal--my-project-v2--scope",
    );
  });

  it("collapses non-ASCII characters", () => {
    expect(slugifyProjectPath("/Users/vishal/Documents/café/naïve/项目")).toBe(
      "-Users-vishal-Documents-caf--na-ve---",
    );
  });

  it("returns empty string for empty input", () => {
    expect(slugifyProjectPath("")).toBe("");
  });

  it("does not truncate a slug that is exactly 200 characters", () => {
    const slug = slugifyProjectPath(SANITIZED_200);
    expect(slug).toBe("-" + "a".repeat(199));
    expect(slug.length).toBe(200);
  });

  it("truncates at 200 characters and appends a base-36 hash at 201", () => {
    const slug = slugifyProjectPath(SANITIZED_201);
    const [head, hash] = [slug.slice(0, 200), slug.slice(201)];
    expect(head).toBe("-" + "a".repeat(199));
    expect(slug[200]).toBe("-");
    expect(hash).toMatch(/^[0-9a-z]+$/);
    expect(slug.length).toBe(200 + 1 + hash.length);
  });

  it("is stable: the same path always produces the same slug", () => {
    expect(slugifyProjectPath(SANITIZED_201)).toBe(slugifyProjectPath(SANITIZED_201));
  });

  it("distinguishes two long paths that share their first 200 sanitized characters", () => {
    const a = slugifyProjectPath(SANITIZED_200 + "/one");
    const b = slugifyProjectPath(SANITIZED_200 + "/two");
    expect(a.slice(0, 200)).toBe(b.slice(0, 200));
    expect(a).not.toBe(b);
  });

  it("hashes over the original path, so two paths with identical sanitized forms differ", () => {
    // "." and "/" both sanitize to "-", so these share every sanitized
    // character; only a hash over the raw path can tell them apart.
    const dotted = SANITIZED_200 + ".one";
    const slashed = SANITIZED_200 + "/one";
    expect(slugifyProjectPath(dotted)).not.toBe(slugifyProjectPath(slashed));
  });

  it("keeps the hash a non-negative integer when the int32 accumulator wraps", () => {
    // 1515 characters: hash31 overflows many times and lands on a
    // negative int32 (-777817439). Without Math.abs the slug would carry
    // a stray dash; without `| 0` the accumulator would reach Infinity.
    const deep = "/home/user/" + "deep/".repeat(300) + "leaf";
    const hash = slugifyProjectPath(deep).slice(201);
    expect(hash).toBe((777_817_439).toString(36));
    expect(hash).not.toMatch(/[-.]/);
    expect(Number.parseInt(hash, 36)).toBe(777_817_439);
  });
});

// ─────────────────────────────────────────────────────────────────────
// deslugifyProjectPath
// ─────────────────────────────────────────────────────────────────────

describe("deslugifyProjectPath", () => {
  it("round-trips a unix path with no lossy characters", () => {
    const p = "/home/user/code/foo";
    expect(deslugifyProjectPath(slugifyProjectPath(p))).toBe(p);
  });

  it("recovers a Windows drive path with forward slashes", () => {
    expect(deslugifyProjectPath("C--Users-Vishal-Project")).toBe("C:/Users/Vishal/Project");
  });

  it("returns the raw slug for a truncated slug instead of fabricating a path", () => {
    const slug = slugifyProjectPath(SANITIZED_201);
    expect(deslugifyProjectPath(slug)).toBe(slug);
  });

  it("returns an unrecognized shape unchanged", () => {
    expect(deslugifyProjectPath("no-leading-dash")).toBe("no-leading-dash");
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
