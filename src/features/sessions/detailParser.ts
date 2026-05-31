/**
 * Single-session detail view parsing.
 *
 * `parseSessionDetail` reads one transcript and returns a paged (or
 * query-filtered) message list plus session-wide token / tool totals.
 * Split out from the list-building path so the heavy per-message walk
 * doesn't live alongside `parseSessions`.
 *
 * Pure Node.js file I/O, no VS Code dependency.
 */
import { parseJsonlFile, getSessionFile } from "./metaParser";
import { parseSessions } from "./historyParser";
import type {
  Session,
  SessionDetail,
  SessionEntry,
  Message,
  ToolUseBlock,
} from "./types";

/** Maximum messages returned per detail view page (first/last). */
const DETAIL_PAGE_SIZE = 50;

/**
 * Produce a short, human-readable argument hint from a tool's input
 * object. We don't dump the full JSON — detail view renders one line
 * per tool call, so it only needs the piece that tells the user
 * "what file / command / pattern". Fields picked match Claude's
 * built-in tool schemas observed in real transcripts.
 */
function summariseToolInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  // Normalised field order — first match wins. Keeps parser
  // resilient to new tools: a new tool with `file_path` or
  // `command` gets a sensible default without a code change.
  const pick = (keys: string[]): string => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const primary = pick([
    "command",       // Bash
    "file_path",     // Read / Edit / Write
    "path",          // alternate Read
    "pattern",       // Grep / Glob
    "url",           // WebFetch
    "query",         // WebSearch
    "description",   // TaskCreate
    "prompt",        // Agent
    "notebook_path", // NotebookEdit
  ]);
  if (primary) {
    // Cap length — arg shown on one row in the detail view, so an
    // absurdly long command shouldn't stretch the panel.
    return primary.length > 120 ? primary.slice(0, 117) + "…" : primary;
  }
  // Fallback: first string value we find so something meaningful
  // surfaces for MCP tools we don't recognise.
  for (const v of Object.values(o)) {
    if (typeof v === "string" && v.trim()) {
      return v.length > 120 ? v.slice(0, 117) + "…" : v;
    }
  }
  return "";
}

/**
 * Parse a page of messages from a session transcript.
 *
 * @param mode - "last" returns the most recent N messages (default, so
 *   continued sessions show the latest conversation). "first" returns the
 *   earliest N messages (the session's opening). N = DETAIL_PAGE_SIZE (50).
 *
 * The caller gets `totalMessages` to decide whether to show a toggle, and
 * `mode` echoed back so the webview knows which view is active.
 *
 * Returns null if the session cannot be found.
 */
export function parseSessionDetail(
  sessionId: string,
  cachedSession?: Session,
  mode: "first" | "last" = "last",
  query?: string,
): SessionDetail | null {
  const session =
    cachedSession ?? parseSessions().find((s) => s.id === sessionId);
  if (!session) return null;

  const sessionFile = getSessionFile(sessionId);
  if (!sessionFile) {
    return { ...session, messages: [], detailMode: mode, totalMessages: 0 };
  }

  // Normalise query once up front. Empty / whitespace-only strings
  // count as "no query" so the webview can clear its filter without
  // triggering a second request shape.
  const q = query?.trim().toLowerCase() ?? "";

  const entries = parseJsonlFile<SessionEntry>(sessionFile);
  const allMessages: Message[] = [];

  for (const entry of entries) {
    if (!entry.message?.role) continue;
    if (entry.type === "file-history-snapshot") continue;
    if (entry.isSidechain) continue;

    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;

    // Walk the content blocks once, splitting into four buckets:
    //   text    → user-visible prose (keeps ordering)
    //   thinking→ extended-thinking prose (concatenated separately)
    //   toolUses→ one row per tool_use for rendering
    //   tool_result blocks flatten into text so users see command
    //   output inline — same-shape as plain text for detail view
    const textParts: string[] = [];
    let thinkingText = "";
    const toolUses: ToolUseBlock[] = [];

    if (typeof entry.message.content === "string") {
      textParts.push(entry.message.content);
    } else if (Array.isArray(entry.message.content)) {
      for (const block of entry.message.content) {
        const t = block.type;
        if (t === "text" && typeof block.text === "string") {
          textParts.push(block.text);
        } else if (t === "thinking" && typeof block.thinking === "string") {
          thinkingText += (thinkingText ? "\n\n" : "") + block.thinking;
        } else if (t === "tool_use" && typeof block.name === "string") {
          toolUses.push({
            name: block.name,
            arg: summariseToolInput(block.name, block.input),
          });
        } else if (t === "tool_result") {
          // Flatten tool_result so command output appears in-line
          // under the assistant/user turn that ran the tool. Result
          // `content` is either string or an array of text blocks.
          const c = (block as { content?: unknown }).content;
          if (typeof c === "string") {
            textParts.push(c);
          } else if (Array.isArray(c)) {
            for (const inner of c) {
              const innerText = (inner as { text?: unknown }).text;
              if (typeof innerText === "string") textParts.push(innerText);
            }
          }
        }
      }
    }

    const content = textParts.join("\n").trim();

    // Keep assistant messages that have no text but do have tool calls
    // — users still want to see "Claude ran Bash: git status" even
    // when the turn was just tool calls. Drop completely empty turns.
    const hasUsable =
      content.length > 0 || toolUses.length > 0 || thinkingText.length > 0;
    if (!hasUsable) continue;

    const msg: Message = {
      role: role as "user" | "assistant",
      content,
      timestamp: entry.timestamp ?? "",
    };
    if (toolUses.length > 0) msg.toolUses = toolUses;
    if (thinkingText) msg.thinking = thinkingText;
    if (role === "assistant") {
      const u = entry.message.usage;
      if (u) {
        msg.usage = {
          input: typeof u.input_tokens === "number" ? u.input_tokens : 0,
          output: typeof u.output_tokens === "number" ? u.output_tokens : 0,
          cacheRead:
            typeof u.cache_read_input_tokens === "number"
              ? u.cache_read_input_tokens
              : 0,
          cacheCreation:
            typeof u.cache_creation_input_tokens === "number"
              ? u.cache_creation_input_tokens
              : 0,
        };
      }
      if (typeof entry.message.model === "string") {
        msg.model = entry.message.model;
      }
    }
    allMessages.push(msg);
  }

  const total = allMessages.length;

  // Session-wide token + tool totals summed across every message so
  // the detail view can show a "spent X on this session" line
  // without the caller recomputing from a paged message list.
  let totalToolUses = 0;
  let hasUsage = false;
  const totalUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
  };
  for (const m of allMessages) {
    if (m.toolUses) totalToolUses += m.toolUses.length;
    if (m.usage) {
      hasUsage = true;
      totalUsage.input += m.usage.input;
      totalUsage.output += m.usage.output;
      totalUsage.cacheRead += m.usage.cacheRead;
      totalUsage.cacheCreation += m.usage.cacheCreation;
    }
  }

  // Query-mode: filter across the full transcript and return every
  // match. We intentionally skip paging here — search exists
  // specifically to let users find things beyond the 50-msg window,
  // so truncating hits would defeat the feature. On long sessions
  // (10k+ msgs) the match set stays small in practice because
  // queries are specific enough.
  //
  // Matching fields: content, thinking, tool name + arg. Case-
  // insensitive substring (haystack pre-lowered at compare time to
  // avoid allocating lowercased copies of entire transcripts when
  // most messages won't match).
  if (q) {
    const matches: Message[] = [];
    for (const m of allMessages) {
      const haystack = [
        m.content,
        m.thinking ?? "",
        ...(m.toolUses ?? []).map((t) => `${t.name} ${t.arg}`),
      ]
        .join("\n")
        .toLowerCase();
      if (haystack.includes(q)) matches.push(m);
    }
    return {
      ...session,
      messages: matches,
      messageCount: matches.length,
      totalMessages: total,
      detailMode: mode,
      detailQuery: q,
      totalMatches: matches.length,
      totalToolUses,
      ...(hasUsage ? { totalUsage } : {}),
    };
  }

  // Default paged view (no query).
  const page = mode === "first"
    ? allMessages.slice(0, DETAIL_PAGE_SIZE)
    : allMessages.slice(-DETAIL_PAGE_SIZE);

  return {
    ...session,
    messages: page,
    messageCount: page.length,
    totalMessages: total,
    detailMode: mode,
    totalToolUses,
    ...(hasUsage ? { totalUsage } : {}),
  };
}
