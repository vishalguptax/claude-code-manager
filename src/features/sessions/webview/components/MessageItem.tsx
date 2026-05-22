/**
 * One transcript message in the detail view: optional thinking block, tool
 * rows, the (optionally search-highlighted) text body, a usage stamp, and the
 * hover-revealed copy / ask-again actions.
 *
 * Search highlighting splits the text into plain + matched segments and lets
 * Preact render each as a text node or <mark> — no innerHTML, so it stays
 * XSS-safe by construction.
 */
import { Icon } from "../../../../webview/shared/ui";
import { cx } from "../../../../webview/shared/lib";
import type { Message } from "../../types";

/** Compact token formatter — 980, 1.2k, 10.6k, 1.5M, 2.76B. */
export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
}

/**
 * Split `text` into alternating non-match / match segments for `query`
 * (case-insensitive). Returns segments tagged so the caller can render
 * matches inside <mark>. Empty query yields a single non-match segment.
 */
export function splitHighlight(
  text: string,
  query: string,
): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const out: { text: string; match: boolean }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const hit = lower.indexOf(q, cursor);
    if (hit === -1) {
      out.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (hit > cursor) out.push({ text: text.slice(cursor, hit), match: false });
    out.push({ text: text.slice(hit, hit + q.length), match: true });
    cursor = hit + q.length;
  }
  return out;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((seg, i) =>
        seg.match ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          <mark class="d-match" key={i}>
            {seg.text}
          </mark>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}

export interface MessageItemProps {
  message: Message;
  /** Index into the host-returned messages array (for copy / ask-again). */
  index: number;
  query: string;
  onCopy: (index: number) => void;
  onAskAgain: (index: number) => void;
  copied: boolean;
}

export function MessageItem({
  message: m,
  index,
  query,
  onCopy,
  onAskAgain,
  copied,
}: MessageItemProps) {
  const thinkingOpen = Boolean(query && m.thinking?.toLowerCase().includes(query));
  const displayed =
    !query && m.content.length > 500 ? `${m.content.slice(0, 500)}…` : m.content;

  const usage = m.usage;
  const usageBits: string[] = [];
  if (usage) {
    if (usage.output) usageBits.push(`${fmtTokens(usage.output)} out`);
    if (usage.input) usageBits.push(`${fmtTokens(usage.input)} in`);
    const cache = usage.cacheRead + usage.cacheCreation;
    if (cache) usageBits.push(`${fmtTokens(cache)} cache`);
  }

  return (
    <div class={cx("d-msg", `d-msg-${m.role}`)}>
      <div class="d-msg-head">
        <span class="d-msg-role">{m.role === "user" ? "You" : "Claude"}</span>
        <div class="d-msg-actions">
          <button
            type="button"
            class={cx("d-msg-action", { "is-copied": copied })}
            title="Copy message"
            aria-label="Copy message"
            onClick={(e) => {
              e.stopPropagation();
              onCopy(index);
            }}
          >
            <Icon name="copy" size={12} />
          </button>
          {m.role === "user" ? (
            <button
              type="button"
              class="d-msg-action"
              title="Ask again in a new Claude session"
              aria-label="Ask again"
              onClick={(e) => {
                e.stopPropagation();
                onAskAgain(index);
              }}
            >
              <Icon name="message-square" size={12} />
            </button>
          ) : null}
        </div>
      </div>

      {m.thinking ? (
        <details class="d-msg-thinking" open={thinkingOpen}>
          <summary>Thinking</summary>
          <div class="d-msg-thinking-body">
            <Highlighted text={m.thinking} query={query} />
          </div>
        </details>
      ) : null}

      {m.toolUses && m.toolUses.length > 0 ? (
        <ul class="d-msg-tools">
          {m.toolUses.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: tool calls are positional
            <li class="d-msg-tool" key={i}>
              <span class="d-msg-tool-name">
                <Highlighted text={t.name} query={query} />
              </span>
              {t.arg ? (
                <span class="d-msg-tool-arg">
                  <Highlighted text={t.arg} query={query} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {m.content ? (
        <div class="d-msg-content">
          <Highlighted text={displayed} query={query} />
        </div>
      ) : null}

      {usageBits.length ? (
        <div
          class="d-msg-usage"
          title={
            usage
              ? `Input ${usage.input} · Output ${usage.output} · Cache read ${usage.cacheRead} · Cache creation ${usage.cacheCreation}`
              : ""
          }
        >
          {usageBits.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}
