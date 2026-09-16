import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  clearPromptHistoryCache,
  collapseRepeats,
  measureAttachments,
  projectNameOf,
  readPromptHistory,
  readPromptHistoryUncached,
  toPromptEntry,
} from "../parser";
import type { PromptEntry } from "../types";

// Real files, not a mocked fs: the parser's job IS filesystem shape — chunk
// boundaries, torn final lines, a missing file, an mtime that moved. A mock
// would exercise none of it.
const ROOT = path.join(os.tmpdir(), ".claude-test-prompts");
const HISTORY = path.join(ROOT, "history.jsonl");

const SESSION_A = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const SESSION_B = "0bc64250-c3a3-4936-a32e-2a261f3f49a0";
const PROJECT_A = "/Users/vishal/WORK/Personal/2026/claude-code-manager";

/** One history.jsonl line in the exact shape the CLI writes (key order included). */
function line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    display: "run the tests",
    pastedContents: {},
    timestamp: 1783156548849,
    project: PROJECT_A,
    sessionId: SESSION_A,
    ...overrides,
  });
}

function write(...lines: string[]): void {
  fs.writeFileSync(HISTORY, lines.join("\n") + "\n");
}

beforeEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  clearPromptHistoryCache();
});

afterEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

describe("projectNameOf", () => {
  it("takes the last segment of a posix path", () => {
    expect(projectNameOf(PROJECT_A)).toBe("claude-code-manager");
  });

  it("takes the last segment of a windows path", () => {
    expect(projectNameOf("C:\\Users\\me\\proj")).toBe("proj");
  });

  it("ignores a trailing separator", () => {
    expect(projectNameOf("/a/b/c/")).toBe("c");
  });

  it("returns empty for an unrecorded project", () => {
    expect(projectNameOf("")).toBe("");
  });
});

describe("measureAttachments", () => {
  it("counts nothing for the common empty map", () => {
    expect(measureAttachments({})).toEqual({ count: 0, chars: 0 });
  });

  it("sums the characters of content-bearing attachments", () => {
    const result = measureAttachments({
      "1": { id: 1, type: "text", content: "abcde" },
      "2": { id: 2, type: "text", content: "xy" },
    });
    expect(result).toEqual({ count: 2, chars: 7 });
  });

  it("counts a hashed attachment but measures it as zero", () => {
    // Observed in real data: 15 of 49 non-empty maps carry contentHash and no
    // content. That is a real attachment with an unknown size, not a missing one.
    expect(measureAttachments({ "1": { id: 1, type: "image", contentHash: "ab12" } })).toEqual(
      { count: 1, chars: 0 },
    );
  });

  it("tolerates a non-object pastedContents", () => {
    expect(measureAttachments(undefined)).toEqual({ count: 0, chars: 0 });
    expect(measureAttachments(null)).toEqual({ count: 0, chars: 0 });
    expect(measureAttachments("nope")).toEqual({ count: 0, chars: 0 });
  });
});

describe("toPromptEntry", () => {
  it("maps a well-formed line", () => {
    const entry = toPromptEntry(JSON.parse(line()), 7);
    expect(entry).toEqual({
      id: `${SESSION_A}#7`,
      text: "run the tests",
      timestamp: 1783156548849,
      projectPath: PROJECT_A,
      projectName: "claude-code-manager",
      sessionId: SESSION_A,
      repeatCount: 1,
      attachmentCount: 0,
      attachmentChars: 0,
    });
  });

  it("drops a line with no prompt text", () => {
    expect(toPromptEntry({}, 0)).toBeNull();
    expect(toPromptEntry({ display: "" }, 0)).toBeNull();
    expect(toPromptEntry({ display: 42 }, 0)).toBeNull();
  });

  it("drops the CLI's synthetic /login prompt", () => {
    expect(toPromptEntry({ display: "/login " }, 0)).toBeNull();
  });

  it("degrades each missing key independently", () => {
    const entry = toPromptEntry({ display: "orphan prompt" }, 3);
    expect(entry).toMatchObject({
      id: "#3",
      text: "orphan prompt",
      timestamp: 0,
      projectPath: "",
      projectName: "",
      sessionId: "",
    });
  });

  it("rejects a non-numeric timestamp rather than propagating NaN", () => {
    const entry = toPromptEntry({ display: "x", timestamp: "yesterday" }, 0);
    expect(entry?.timestamp).toBe(0);
  });
});

describe("collapseRepeats", () => {
  function entry(over: Partial<PromptEntry>): PromptEntry {
    return {
      id: "a#0",
      text: "retry",
      timestamp: 1,
      projectPath: PROJECT_A,
      projectName: "claude-code-manager",
      sessionId: SESSION_A,
      repeatCount: 1,
      attachmentCount: 0,
      attachmentChars: 0,
      ...over,
    };
  }

  it("collapses a consecutive run and counts it", () => {
    const out = collapseRepeats([
      entry({ id: "a#0", timestamp: 10 }),
      entry({ id: "a#1", timestamp: 20 }),
      entry({ id: "a#2", timestamp: 30 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].repeatCount).toBe(3);
    // First occurrence's identity, last occurrence's time.
    expect(out[0].id).toBe("a#0");
    expect(out[0].timestamp).toBe(30);
  });

  it("does NOT collapse non-consecutive duplicates", () => {
    const out = collapseRepeats([
      entry({ id: "a#0", text: "same", timestamp: 10 }),
      entry({ id: "a#1", text: "different", timestamp: 20 }),
      entry({ id: "a#2", text: "same", timestamp: 30 }),
    ]);
    expect(out.map((e) => e.text)).toEqual(["same", "different", "same"]);
    expect(out.every((e) => e.repeatCount === 1)).toBe(true);
  });

  it("does NOT collapse identical text across two sessions", () => {
    const out = collapseRepeats([
      entry({ id: "a#0", sessionId: SESSION_A }),
      entry({ id: "b#1", sessionId: SESSION_B }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("returns an empty list unchanged", () => {
    expect(collapseRepeats([])).toEqual([]);
  });
});

describe("readPromptHistoryUncached", () => {
  it("parses well-formed lines newest first", () => {
    write(
      line({ display: "first", timestamp: 100 }),
      line({ display: "second", timestamp: 200 }),
      line({ display: "third", timestamp: 300 }),
    );
    expect(readPromptHistoryUncached(HISTORY).map((e) => e.text)).toEqual([
      "third",
      "second",
      "first",
    ]);
  });

  it("skips a malformed line mid-file and keeps the rest", () => {
    write(
      line({ display: "before", timestamp: 100 }),
      '{"display": "torn", "timesta',
      line({ display: "after", timestamp: 300 }),
    );
    expect(readPromptHistoryUncached(HISTORY).map((e) => e.text)).toEqual([
      "after",
      "before",
    ]);
  });

  it("skips a blank line without consuming a line index", () => {
    fs.writeFileSync(
      HISTORY,
      [line({ display: "a", timestamp: 1 }), "", line({ display: "b", timestamp: 2 })].join(
        "\n",
      ) + "\n",
    );
    const entries = readPromptHistoryUncached(HISTORY);
    expect(entries).toHaveLength(2);
    // Indexes follow file position, blank line included, so ids stay stable
    // when the CLI appends after a blank.
    expect(entries.map((e) => e.id)).toEqual([`${SESSION_A}#2`, `${SESSION_A}#0`]);
  });

  it("reads a line missing every optional key", () => {
    write(JSON.stringify({ display: "bare" }));
    expect(readPromptHistoryUncached(HISTORY)).toEqual([
      {
        id: "#0",
        text: "bare",
        timestamp: 0,
        projectPath: "",
        projectName: "",
        sessionId: "",
        repeatCount: 1,
        attachmentCount: 0,
        attachmentChars: 0,
      },
    ]);
  });

  it("drops a torn trailing line but keeps everything before it", () => {
    // The CLI appends while we read, so the final line is routinely half
    // written and has no newline after it.
    fs.writeFileSync(
      HISTORY,
      line({ display: "complete", timestamp: 10 }) + "\n" + '{"display":"half-writ',
    );
    expect(readPromptHistoryUncached(HISTORY).map((e) => e.text)).toEqual(["complete"]);
  });

  it("keeps a complete final line that has no trailing newline", () => {
    fs.writeFileSync(HISTORY, line({ display: "last", timestamp: 10 }));
    expect(readPromptHistoryUncached(HISTORY).map((e) => e.text)).toEqual(["last"]);
  });

  it("returns an empty list for an empty file", () => {
    fs.writeFileSync(HISTORY, "");
    expect(readPromptHistoryUncached(HISTORY)).toEqual([]);
  });

  it("returns an empty list for a missing file", () => {
    expect(readPromptHistoryUncached(path.join(ROOT, "nope.jsonl"))).toEqual([]);
  });

  it("groups by project without losing either project's prompts", () => {
    write(
      line({ display: "in a", project: "/w/alpha", timestamp: 10 }),
      line({ display: "in b", project: "/w/beta", sessionId: SESSION_B, timestamp: 20 }),
    );
    const entries = readPromptHistoryUncached(HISTORY);
    expect(entries.map((e) => e.projectName)).toEqual(["beta", "alpha"]);
    expect(entries.map((e) => e.projectPath)).toEqual(["/w/beta", "/w/alpha"]);
  });

  it("collapses consecutive retries read from disk", () => {
    write(
      line({ display: "retry me", timestamp: 10 }),
      line({ display: "retry me", timestamp: 20 }),
      line({ display: "retry me", timestamp: 30 }),
      line({ display: "moved on", timestamp: 40 }),
    );
    const entries = readPromptHistoryUncached(HISTORY);
    expect(entries.map((e) => [e.text, e.repeatCount])).toEqual([
      ["moved on", 1],
      ["retry me", 3],
    ]);
  });

  it("does not hold a large pastedContents blob in the list model", () => {
    const blob = "x".repeat(200_000);
    write(
      line({
        display: "explain this file",
        pastedContents: { "1": { id: 1, type: "text", content: blob } },
      }),
    );
    const entries = readPromptHistoryUncached(HISTORY);

    expect(entries[0].attachmentCount).toBe(1);
    expect(entries[0].attachmentChars).toBe(200_000);
    expect(entries[0]).not.toHaveProperty("pastedContents");
    // The whole model serialises to a fraction of the 200 KB line it came from.
    expect(JSON.stringify(entries).length).toBeLessThan(2_000);
  });

  it("does not corrupt multi-byte text that straddles a 64 KB read boundary", () => {
    // Filler pushes the emoji past the first chunk boundary; a naive
    // buf.toString() per chunk would split it into replacement characters.
    const filler = line({ display: "f".repeat(70_000), timestamp: 1 });
    write(filler, line({ display: "ship it 🚀 日本語", timestamp: 2 }));
    expect(readPromptHistoryUncached(HISTORY)[0].text).toBe("ship it 🚀 日本語");
  });
});

describe("readPromptHistory caching", () => {
  it("serves a repeat read from cache", () => {
    write(line({ display: "cached", timestamp: 10 }));
    const first = readPromptHistory(HISTORY);
    const second = readPromptHistory(HISTORY);
    // Same array identity — the file was not re-streamed.
    expect(second).toBe(first);
  });

  it("re-reads when the file changes", () => {
    write(line({ display: "before", timestamp: 10 }));
    expect(readPromptHistory(HISTORY).map((e) => e.text)).toEqual(["before"]);

    write(line({ display: "before", timestamp: 10 }), line({ display: "after", timestamp: 20 }));
    expect(readPromptHistory(HISTORY).map((e) => e.text)).toEqual(["after", "before"]);
  });

  it("re-reads when only the mtime moves", () => {
    // A same-size rewrite: size alone would say "unchanged", so the mtime half
    // of the key is what has to catch it.
    write(line({ display: "aaaa", timestamp: 10 }));
    expect(readPromptHistory(HISTORY).map((e) => e.text)).toEqual(["aaaa"]);

    write(line({ display: "bbbb", timestamp: 10 }));
    const future = new Date(Date.now() + 10_000);
    fs.utimesSync(HISTORY, future, future);
    expect(readPromptHistory(HISTORY).map((e) => e.text)).toEqual(["bbbb"]);
  });

  it("re-streams after the cache is cleared", () => {
    write(line({ display: "cached", timestamp: 10 }));
    const first = readPromptHistory(HISTORY);
    clearPromptHistoryCache();
    expect(readPromptHistory(HISTORY)).not.toBe(first);
  });

  it("returns an empty list for a missing file without caching it", () => {
    const missing = path.join(ROOT, "gone.jsonl");
    expect(readPromptHistory(missing)).toEqual([]);
    fs.writeFileSync(missing, line({ display: "appeared", timestamp: 10 }));
    expect(readPromptHistory(missing).map((e) => e.text)).toEqual(["appeared"]);
  });
});
