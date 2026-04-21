/**
 * Detail view -- renders the full session detail panel with metadata,
 * action buttons, info section, and prompt history.
 */

import { icon } from "../../../../webview/icons";
import { esc, fmtTime, fmtDuration, flash } from "../../../../webview/utils";
import { isClaudeCodeExtensionInstalled } from "../../../../webview/extensionStatus";
import {
  sendResumeSession,
  sendOpenProject,
  sendForkSession,
  sendCopyCommand,
  sendPinSession,
  sendUnpinSession,
  sendRenameSession,
  sendExportSession,
  sendGetSessionDetail,
  sendLaunchChatWithPrompt,
  sendOpenProjectAndChat,
} from "../api";
import {
  getDetail,
  isLoading,
  getPinnedIds,
  getCurrentProjectName,
  setView,
  getDetailSearchQuery,
  setDetailSearchQuery,
} from "../state";
import { showList } from "./listView";
import { confirmDelete } from "../components/contextMenu";
import type { Message } from "../../types";

/**
 * Compact number formatter shared across per-message stamps + stat
 * strip totals. Boundaries chosen so the visible precision stays
 * meaningful (1.2k beats 1,200 for glance-reading) and never loses
 * scale. Uppercase M / B follow common SI convention; k stays
 * lowercase because that's how terminals and most dashboards write
 * it ("10k PRs", "3.5k LoC").
 *
 *   980        → "980"       (under 1k: raw)
 *   1200       → "1.2k"
 *   10_582     → "10.6k"
 *   1_500_000  → "1.5M"
 *   2_755_200_000 → "2.76B"
 */
/**
 * Wrap each case-insensitive occurrence of `query` inside `text` with
 * a `<mark>` tag. Input is already the raw message content (unescaped);
 * we escape the non-match chunks + the match itself separately to keep
 * output safe. Returns escaped HTML.
 */
/**
 * Mirrors DETAIL_PAGE_SIZE in parser.ts — toggle only meaningful
 * when the session has more messages than fit in a single page.
 * Kept in sync manually; no runtime coupling worth a round-trip.
 */
const DETAIL_PAGE_SIZE_FOR_TOGGLE = 50;

function highlight(text: string, query: string): string {
  if (!query) return esc(text);
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  let out = "";
  let cursor = 0;
  while (cursor < text.length) {
    const hit = lower.indexOf(q, cursor);
    if (hit === -1) {
      out += esc(text.slice(cursor));
      break;
    }
    if (hit > cursor) out += esc(text.slice(cursor, hit));
    out += `<mark class="d-match">${esc(text.slice(hit, hit + q.length))}</mark>`;
    cursor = hit + q.length;
  }
  return out;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "") + "B";
}

/**
 * Build the body HTML for one message. Broken out of the main render
 * so each section (thinking / tools / text / usage) is readable at a
 * glance and rules like "keep message content primary" map 1:1 to
 * visual weight in the output.
 *
 * Section order:
 *   1. Thinking (collapsed <details>) — opt-in, off by default
 *   2. Tool-use rows — dim, monospace, one per call
 *   3. Text content — unchanged, full weight
 *   4. Usage stamp — right-aligned, tiny, muted
 */
function renderMessageBody(m: Message, query: string = ""): string {
  const parts: string[] = [];

  // When search is active we render the thinking block expanded so
  // matches inside it are visible without another click. Default
  // state (no query) keeps it collapsed.
  const thinkingOpen = query && m.thinking?.toLowerCase().includes(query)
    ? " open"
    : "";

  if (m.thinking) {
    parts.push(
      `<details class="d-msg-thinking"${thinkingOpen}>
         <summary>Thinking</summary>
         <div class="d-msg-thinking-body">${highlight(m.thinking, query)}</div>
       </details>`,
    );
  }

  if (m.toolUses && m.toolUses.length > 0) {
    parts.push(
      `<ul class="d-msg-tools">` +
        m.toolUses
          .map(
            (t) => `<li class="d-msg-tool">
          <span class="d-msg-tool-name">${highlight(t.name, query)}</span>${
              t.arg ? `<span class="d-msg-tool-arg">${highlight(t.arg, query)}</span>` : ""
            }
        </li>`,
          )
          .join("") +
        `</ul>`,
    );
  }

  if (m.content) {
    // When searching, show the full content so the match is in
    // context — 500-char default cap exists for default view only.
    const displayed = query
      ? m.content
      : m.content.length > 500
        ? m.content.slice(0, 500) + "…"
        : m.content;
    parts.push(`<div class="d-msg-content">${highlight(displayed, query)}</div>`);
  }

  if (m.usage && (m.usage.input || m.usage.output || m.usage.cacheRead || m.usage.cacheCreation)) {
    const u = m.usage;
    const bits: string[] = [];
    if (u.output) bits.push(`${fmtTokens(u.output)} out`);
    if (u.input) bits.push(`${fmtTokens(u.input)} in`);
    const cache = u.cacheRead + u.cacheCreation;
    if (cache) bits.push(`${fmtTokens(cache)} cache`);
    if (bits.length) {
      parts.push(
        `<div class="d-msg-usage" title="Input ${u.input} · Output ${u.output} · Cache read ${u.cacheRead} · Cache creation ${u.cacheCreation}">${bits.join(" · ")}</div>`,
      );
    }
  }

  return parts.join("");
}

/**
 * Render the detail view for the currently selected session.
 * Shows a loading indicator while the detail is being fetched,
 * then renders the full detail with all action buttons wired up.
 * Falls back to the list view if no detail data is available.
 */
export function showDetail(): void {
  setView("detail");
  document.getElementById("listView")?.classList.add("hidden");
  const dv = document.getElementById("detailView");
  if (!dv) return;
  dv.classList.remove("hidden");

  if (isLoading()) {
    dv.innerHTML = `<button class="back-btn" id="goBack">${icon("arrow-left")} Back</button><div class="loading">Loading...</div>`;
    dv.querySelector("#goBack")?.addEventListener("click", showList);
    return;
  }

  const d = getDetail();
  if (!d) { showList(); return; }

  const date = new Date(d.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = fmtTime(d.startTime);
  const dur = fmtDuration(d.endTime - d.startTime);
  const branch = d.branch && d.branch !== "HEAD" ? d.branch : "";
  const currentProjectName = getCurrentProjectName();
  const isDiffProject = currentProjectName && d.projectKey !== currentProjectName;
  const isPinned = getPinnedIds().has(d.id);

  // Compact top: one big title, one-line contextual meta, an optional
  // stat strip. Keeps visual weight on the session's identity and
  // pushes everything else to secondary color.
  const totalMsgs = d.totalMessages ?? d.messageCount;
  const tokenTotal = d.totalUsage
    ? d.totalUsage.input +
      d.totalUsage.output +
      d.totalUsage.cacheRead +
      d.totalUsage.cacheCreation
    : 0;
  const statsRow: string[] = [];
  statsRow.push(
    `<span class="d-stat" title="${totalMsgs.toLocaleString()} message${totalMsgs === 1 ? "" : "s"}"><span class="d-stat-v">${esc(fmtTokens(totalMsgs))}</span><span class="d-stat-k">message${totalMsgs === 1 ? "" : "s"}</span></span>`,
  );
  if (d.totalToolUses && d.totalToolUses > 0) {
    statsRow.push(
      `<span class="d-stat" title="${d.totalToolUses.toLocaleString()} tool call${d.totalToolUses === 1 ? "" : "s"}"><span class="d-stat-v">${esc(fmtTokens(d.totalToolUses))}</span><span class="d-stat-k">tool${d.totalToolUses === 1 ? "" : "s"}</span></span>`,
    );
  }
  if (tokenTotal > 0) {
    const usageTip = d.totalUsage
      ? `Input ${d.totalUsage.input} · Output ${d.totalUsage.output} · Cache read ${d.totalUsage.cacheRead} · Cache creation ${d.totalUsage.cacheCreation}`
      : "";
    statsRow.push(
      `<span class="d-stat" title="${esc(usageTip)}"><span class="d-stat-v">${esc(fmtTokens(tokenTotal))}</span><span class="d-stat-k">tokens</span></span>`,
    );
  }
  statsRow.push(
    `<span class="d-stat"><span class="d-stat-v">${esc(dur)}</span><span class="d-stat-k">duration</span></span>`,
  );

  dv.innerHTML = `
    <button class="back-btn" id="goBack">${icon("arrow-left")} Back</button>

    <div class="d-head">
      <div class="d-title" title="${esc(d.name || d.summary)}">${esc(d.name || d.summary)}</div>
      ${d.name && d.summary ? `<div class="d-subtitle" title="${esc(d.summary)}">${esc(d.summary)}</div>` : ""}
      <div class="d-meta">
        <span class="d-meta-pill">${esc(d.project)}</span>
        ${branch ? `<span class="d-meta-pill d-meta-pill-branch">${icon("git-branch", 11)} ${esc(branch)}</span>` : ""}
        <span class="d-meta-dot" aria-hidden="true">·</span>
        <span>${date} at ${time}</span>
      </div>
      <div class="d-stats">
        ${statsRow.join("")}
      </div>
    </div>

    ${isDiffProject ? `
    <div class="d-notice">
      ${icon("circle-alert")}
      <span>This session belongs to <strong>${esc(d.project)}</strong>. Open that project to resume.</span>
    </div>
    <div class="d-actions">
      <button class="btn primary" id="btnOpenProject">${icon("external-link")} Open ${esc(d.project)}</button>
      ${isClaudeCodeExtensionInstalled() ? `<button class="btn" id="btnOpenProjectChat" title="Open the project in a new window and start a Claude Code chat there">${icon("message-square")} Open &amp; Chat</button>` : ""}
      <button class="btn" id="btnRename">${icon("pencil")} Rename</button>
      <button class="btn" id="btnPin">${icon(isPinned ? "pin-off" : "pin")} ${isPinned ? "Unpin" : "Pin"}</button>
      <button class="btn" id="btnExport" title="Save this session as a portable .jsonl">${icon("upload")} Export</button>
      <button class="btn del" id="btnDelete">${icon("trash-2")} Delete</button>
    </div>` : `
    <div class="d-actions">
      <button class="btn primary" id="btnResume">${icon("play")} Resume</button>
      <button class="btn" id="btnRename">${icon("pencil")} Rename</button>
      <button class="btn" id="btnFork">${icon("git-fork")} Fork</button>
      <button class="btn" id="btnPin">${icon(isPinned ? "pin-off" : "pin")} ${isPinned ? "Unpin" : "Pin"}</button>
      <button class="btn" id="btnCopyCmd">${icon("terminal")} Copy Cmd</button>
      <button class="btn" id="btnExport" title="Save this session as a portable .jsonl">${icon("upload")} Export</button>
      <button class="btn del" id="btnDelete">${icon("trash-2")} Delete</button>
    </div>`}

    <div class="d-scroll">
      ${(() => {
        const mode = d.detailMode ?? "last";
        const total = d.totalMessages ?? d.messages.length;
        const activeQuery = getDetailSearchQuery();
        const isSearching = activeQuery.length > 0;
        // Toggle visibility decoupled from search state to stop the
        // header from jumping when the user starts typing. Always
        // render when the session is long enough to be paged; just
        // disable interaction during a search (mode is meaningless
        // when results are filtered across the full transcript).
        const showToggle = total > DETAIL_PAGE_SIZE_FOR_TOGGLE;
        const matchCount = d.totalMatches ?? d.messages.length;
        // Placeholder while host re-searches: echoed query on
        // SessionDetail confirms we're looking at the latest reply.
        // Mismatch = stale result from a previous keystroke.
        const stale = isSearching && d.detailQuery !== activeQuery;
        return `
      <div class="d-section">
        <div class="d-msg-header">
          <div class="d-label-row">
            <span class="d-label">Messages (${total})</span>
            ${showToggle ? `
            <div class="vs-segmented vs-segmented--sm ${isSearching ? "is-disabled" : ""}" ${isSearching ? "aria-hidden=\"true\"" : ""}>
              <button class="vs-segmented-btn ${mode === "last" ? "active" : ""}" id="msgLast" ${isSearching ? "disabled" : ""}>Latest</button>
              <button class="vs-segmented-btn ${mode === "first" ? "active" : ""}" id="msgFirst" ${isSearching ? "disabled" : ""}>Earliest</button>
            </div>` : ""}
          </div>
          <div class="d-msg-search ${isSearching ? "has-value" : ""}">
            <input id="msgSearchInput"
              class="d-msg-search-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search messages..."
              value="${esc(activeQuery)}"
              aria-label="Search messages" />
            ${isSearching ? `
              <div class="d-msg-search-addon">
                <span class="d-msg-search-count">${stale ? "…" : `${matchCount}`}</span>
                <button class="d-msg-search-clear" id="msgSearchClear" title="Clear search" aria-label="Clear search">${icon("x", 12)}</button>
              </div>` : ""}
          </div>
        </div>
        ${!isSearching && mode === "first" && showToggle ? `<div class="d-msg-hint">Showing first ${d.messages.length} of ${total} messages</div>` : ""}
        ${!isSearching && mode === "last" && showToggle ? `<div class="d-msg-hint">Showing last ${d.messages.length} of ${total} messages · newest first</div>` : ""}
        ${isSearching && !stale && d.messages.length === 0 ? `<div class="d-msg-hint">No matches.</div>` : ""}
        ${(() => {
          // "Latest" mode renders newest-first so the most recent turn
          // is visible without scrolling to the bottom. "Earliest" +
          // search modes keep chronological order — search results
          // read naturally top-to-bottom, and the Earliest toggle
          // explicitly asks for the session opening.
          //
          // We walk `d.messages` with the original index captured in
          // `origIdx` so click handlers can still look the message
          // up by `d.messages[origIdx]` after reversal.
          const indexed = d.messages.map((m, origIdx) => ({ m, origIdx }));
          return !isSearching && mode === "last" ? indexed.slice().reverse() : indexed;
        })().map(({ m, origIdx }) => {
          // Per-message actions sit in the top-right corner, hover-
          // revealed. Copy is always available; Ask Again is user-
          // prompts-only and extension-gated.
          const copyBtn = `<button class="d-msg-action" data-copy-idx="${origIdx}" title="Copy message" aria-label="Copy message">${icon("copy", 12)}</button>`;
          const askAgain = m.role === "user"
            ? `<button class="d-msg-action" data-ask-idx="${origIdx}" title="Ask again in a new Claude session" aria-label="Ask again">${icon("message-square", 12)}</button>`
            : "";
          return `<div class="d-msg d-msg-${m.role}">
            <div class="d-msg-head">
              <span class="d-msg-role">${m.role === "user" ? "You" : "Claude"}</span>
              <div class="d-msg-actions">${copyBtn}${askAgain}</div>
            </div>
            ${renderMessageBody(m, activeQuery)}
          </div>`;
        }).join("")}
      </div>`;
      })()}
    </div>`;

  dv.querySelector("#goBack")?.addEventListener("click", showList);
  dv.querySelector("#btnResume")?.addEventListener("click", () =>
    sendResumeSession(d.id, d.entrypoint, d.projectPath)
  );
  dv.querySelector("#btnOpenProject")?.addEventListener("click", () =>
    sendOpenProject(d.projectPath)
  );
  dv.querySelector("#btnOpenProjectChat")?.addEventListener("click", () =>
    sendOpenProjectAndChat(d.projectPath)
  );
  dv.querySelector("#btnFork")?.addEventListener("click", () =>
    sendForkSession(d.id)
  );
  dv.querySelector("#btnCopyCmd")?.addEventListener("click", () => {
    sendCopyCommand(d.id);
    flash("btnCopyCmd", "Copied!");
  });
  dv.querySelector("#btnPin")?.addEventListener("click", () => {
    if (isPinned) {
      sendUnpinSession(d.id);
    } else {
      sendPinSession(d.id);
    }
  });
  dv.querySelector("#btnRename")?.addEventListener("click", () => sendRenameSession(d.id));
  dv.querySelector("#btnExport")?.addEventListener("click", () => sendExportSession(d.id));
  dv.querySelector("#btnDelete")?.addEventListener("click", () => {
    confirmDelete(d.id, () => showList());
  });

  // Message page toggle — re-requests the detail with a different mode.
  // Don't flash a loading state: the request is fast (local file read)
  // and showing "Loading..." mid-flip makes the panel appear to fully
  // reload. Instead, optimistically toggle the active class so the
  // user sees immediate feedback; the response re-renders with fresh
  // message content.
  const swapActive = (activeId: string, inactiveId: string): void => {
    dv.querySelector(`#${activeId}`)?.classList.add("active");
    dv.querySelector(`#${inactiveId}`)?.classList.remove("active");
  };
  dv.querySelector("#msgFirst")?.addEventListener("click", () => {
    if (d.detailMode === "first") return;
    swapActive("msgFirst", "msgLast");
    sendGetSessionDetail(d.id, "first");
  });
  dv.querySelector("#msgLast")?.addEventListener("click", () => {
    if (d.detailMode === "last") return;
    swapActive("msgLast", "msgFirst");
    sendGetSessionDetail(d.id, "last");
  });

  // Transcript search — debounce 200ms so the host isn't spammed per
  // keystroke on long sessions. Empty value reverts to the default
  // paged view (host treats blank query as "no filter").
  const searchInput = dv.querySelector<HTMLInputElement>("#msgSearchInput");
  if (searchInput) {
    // Preserve focus + caret across re-renders so typing feels
    // unbroken. Count/result refresh re-renders the whole detail
    // view; without this the input lost focus every keystroke.
    const priorQuery = getDetailSearchQuery();
    if (priorQuery && document.activeElement !== searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(priorQuery.length, priorQuery.length);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    searchInput.addEventListener("input", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const q = searchInput.value.trim();
        setDetailSearchQuery(q.toLowerCase());
        sendGetSessionDetail(d.id, d.detailMode ?? "last", q);
      }, 200);
    });
    searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        searchInput.value = "";
        setDetailSearchQuery("");
        sendGetSessionDetail(d.id, d.detailMode ?? "last", "");
      }
    });
  }
  dv.querySelector("#msgSearchClear")?.addEventListener("click", () => {
    setDetailSearchQuery("");
    sendGetSessionDetail(d.id, d.detailMode ?? "last", "");
  });

  // Event delegation for per-message action buttons. Binding once
  // on the container survives the message re-render that happens when
  // the user flips the Latest/Earliest toggle.
  dv.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest(".d-msg-action[data-copy-idx]") as HTMLElement | null;
    if (copyBtn) {
      e.stopPropagation();
      const idx = Number.parseInt(copyBtn.dataset.copyIdx ?? "", 10);
      const msg = Number.isFinite(idx) ? d.messages[idx] : undefined;
      if (msg?.content) {
        // Clipboard API available in the webview; fall back silently
        // if the document is unfocused or the call rejects — the
        // visual "Copied" flash still fires so the user gets
        // feedback even on the rare reject path.
        void navigator.clipboard?.writeText(msg.content);
        copyBtn.classList.add("is-copied");
        setTimeout(() => copyBtn.classList.remove("is-copied"), 900);
      }
      return;
    }
    const askBtn = target.closest(".d-msg-action[data-ask-idx]") as HTMLElement | null;
    if (askBtn) {
      e.stopPropagation();
      const idx = Number.parseInt(askBtn.dataset.askIdx ?? "", 10);
      const msg = Number.isFinite(idx) ? d.messages[idx] : undefined;
      if (msg?.content) sendLaunchChatWithPrompt(msg.content);
    }
  });
}
