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
} from "../state";
import { showList } from "./listView";
import { confirmDelete } from "../components/contextMenu";
import type { Message } from "../../types";

/**
 * Compact number formatter for per-message token stamps.
 * Examples: 1200 → "1.2k", 33050 → "33k", 980 → "980".
 */
function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n < 1_000_000) return Math.round(n / 1000) + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
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
function renderMessageBody(m: Message): string {
  const parts: string[] = [];

  if (m.thinking) {
    parts.push(
      `<details class="d-msg-thinking">
         <summary>Thinking</summary>
         <div class="d-msg-thinking-body">${esc(m.thinking)}</div>
       </details>`,
    );
  }

  if (m.toolUses && m.toolUses.length > 0) {
    parts.push(
      `<ul class="d-msg-tools">` +
        m.toolUses
          .map(
            (t) => `<li class="d-msg-tool">
          <span class="d-msg-tool-name">${esc(t.name)}</span>${
              t.arg ? `<span class="d-msg-tool-arg">${esc(t.arg)}</span>` : ""
            }
        </li>`,
          )
          .join("") +
        `</ul>`,
    );
  }

  if (m.content) {
    const displayed =
      m.content.length > 500 ? m.content.slice(0, 500) + "…" : m.content;
    parts.push(`<div class="d-msg-content">${esc(displayed)}</div>`);
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

  dv.innerHTML = `
    <button class="back-btn" id="goBack">${icon("arrow-left")} Back</button>

    <div class="d-head">
      <div class="d-title" title="${esc(d.name || d.summary)}">${esc(d.name || d.summary)}</div>
      ${d.name && d.summary ? `<div class="d-subtitle" title="${esc(d.summary)}">${esc(d.summary)}</div>` : ""}
      <div class="d-tags">
        ${branch ? `<span class="tag">${esc(branch)}</span>` : ""}
        <span class="tag folder">${esc(d.project)}</span>
      </div>
      <div class="d-meta">${date} at ${time} · ${dur} · ${d.messageCount} msgs</div>
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
      <div class="d-section">
        <div class="d-label">Info</div>
        <div class="d-kv"><span class="d-k">ID</span><span class="d-v mono">${d.id.slice(0, 18)}...</span></div>
        <div class="d-kv"><span class="d-k">Path</span><span class="d-v mono">${esc(d.project)}</span></div>
        <div class="d-kv"><span class="d-k">Branch</span><span class="d-v">${branch || "\u2014"}</span></div>
      </div>

      ${d.messages.length ? (() => {
        const mode = d.detailMode ?? "last";
        const total = d.totalMessages ?? d.messages.length;
        const showToggle = total > d.messages.length;
        return `
      <div class="d-section">
        <div class="d-label-row">
          <span class="d-label">Messages (${total})</span>
          ${showToggle ? `
          <div class="vs-segmented vs-segmented--sm">
            <button class="vs-segmented-btn ${mode === "last" ? "active" : ""}" id="msgLast">Latest</button>
            <button class="vs-segmented-btn ${mode === "first" ? "active" : ""}" id="msgFirst">Earliest</button>
          </div>` : ""}
        </div>
        ${mode === "first" && showToggle ? `<div class="d-msg-hint">Showing first ${d.messages.length} of ${total} messages</div>` : ""}
        ${mode === "last" && showToggle ? `<div class="d-msg-hint">Showing last ${d.messages.length} of ${total} messages</div>` : ""}
        ${d.messages.map((m, i) => {
          // Per-message actions sit in the top-right corner, hover-
          // revealed. Copy is always available; Ask Again is user-
          // prompts-only and extension-gated.
          const copyBtn = `<button class="d-msg-action" data-copy-idx="${i}" title="Copy message" aria-label="Copy message">${icon("copy", 12)}</button>`;
          const askAgain = m.role === "user" && isClaudeCodeExtensionInstalled()
            ? `<button class="d-msg-action" data-ask-idx="${i}" title="Ask again in a new chat" aria-label="Ask again in a new chat">${icon("message-square", 12)}</button>`
            : "";
          return `<div class="d-msg d-msg-${m.role}">
            <div class="d-msg-head">
              <span class="d-msg-role">${m.role === "user" ? "You" : "Claude"}</span>
              <div class="d-msg-actions">${copyBtn}${askAgain}</div>
            </div>
            ${renderMessageBody(m)}
          </div>`;
        }).join("")}
      </div>`;
      })() : ""}
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
