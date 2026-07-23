/**
 * Full session detail: header (title, meta, stat strip), context-aware action
 * buttons, and the transcript with a mode toggle and debounced search.
 *
 * Windowing (special-consideration E): the host already pages the transcript
 * (first-N / last-N), so the returned `messages` array is bounded. On top of
 * that we cap the rendered window to MESSAGE_WINDOW rows and reveal more on
 * demand, keeping the DOM light for very long pages without inventing a host
 * message the decomposed host cannot answer.
 */
import { useEffect, useState } from "preact/hooks";
import {
  BackButton,
  Button,
  Icon,
  Segmented,
  type SegmentedOption,
} from "../../../../../webview/shared/ui";
import { isClaudeCodeExtensionInstalled } from "../../../../../webview/extensionStatus";
import { useDebounce } from "../../../../../webview/shared/hooks";
import { cx } from "../../../../../webview/shared/lib";
import { fmtDuration, fmtTime } from "../../../../../webview/utils";
import {
  sendConfirmDelete,
  sendCopyCommand,
  sendCreateWorktree,
  sendExportSession,
  sendForkSession,
  sendGetSessionDetail,
  sendLaunchChatWithPrompt,
  sendOpenProject,
  sendOpenProjectAndChat,
  sendPinSession,
  sendRenameSession,
  sendResumeSession,
  sendUnpinSession,
  sendViewTerminal,
} from "../../api";
import {
  clearSelection,
  currentProjectSignal,
  currentRepoRootSignal,
  detailLoadingSignal,
  detailSignal,
  openTerminalsSignal,
  pinnedSignal,
  selectedIdSignal,
  viewSignal,
  worktreesSignal,
} from "../../model";
import { isSameRepo, pathTail } from "../../lib";
import { MessageItem, fmtTokens } from "../components/MessageItem";
import { DetailSkeleton } from "./DetailSkeleton";
import type { SessionDetail, WorktreeRef } from "../../../types";

/** Matches DETAIL_PAGE_SIZE in parser.ts — toggle only meaningful past this. */
const PAGE_SIZE_FOR_TOGGLE = 50;
/** Max transcript rows kept in the DOM at once; more reveal on demand. */
const MESSAGE_WINDOW = 200;
/** Debounce for the transcript search box. */
const DETAIL_SEARCH_DEBOUNCE_MS = 250;
/** Transcript order toggle — newest-first ("Latest") vs chronological ("Earliest"). */
const MESSAGE_ORDER_OPTIONS: SegmentedOption<"last" | "first">[] = [
  { value: "last", label: "Latest" },
  { value: "first", label: "Earliest" },
];

/** Navigate from detail back to the list, resetting transient detail state. */
function backToList(): void {
  viewSignal.value = "list";
  selectedIdSignal.value = null;
  detailSignal.value = null;
  clearSelection();
}

function StatStrip({ d }: { d: SessionDetail }) {
  const totalMsgs = d.totalMessages ?? d.messageCount;
  // Headline = input + output (Anthropic's two primary billed categories).
  // The previous total also added cache_read + cache_creation, which inflates
  // wildly because cache_read is the SAME cached context re-read on every
  // turn (O(N^2) on long conversations); cache stats belong in the tooltip,
  // not the headline number.
  const u = d.totalUsage;
  const tokenTotal = u ? u.input + u.output : 0;
  const tokenTitle = u
    ? `Input: ${u.input.toLocaleString()} · Output: ${u.output.toLocaleString()}` +
      (u.cacheRead || u.cacheCreation
        ? ` · Cache read: ${u.cacheRead.toLocaleString()} · Cache write: ${u.cacheCreation.toLocaleString()}`
        : "")
    : "";
  return (
    <div class="d-stats">
      <span class="d-stat" title={`${totalMsgs.toLocaleString()} messages`}>
        <span class="d-stat-v">{fmtTokens(totalMsgs)}</span>
        <span class="d-stat-k">message{totalMsgs === 1 ? "" : "s"}</span>
      </span>
      {d.totalToolUses && d.totalToolUses > 0 ? (
        <span class="d-stat" title={`${d.totalToolUses.toLocaleString()} tool calls`}>
          <span class="d-stat-v">{fmtTokens(d.totalToolUses)}</span>
          <span class="d-stat-k">tool{d.totalToolUses === 1 ? "" : "s"}</span>
        </span>
      ) : null}
      {tokenTotal > 0 ? (
        <span class="d-stat" title={tokenTitle}>
          <span class="d-stat-v">{fmtTokens(tokenTotal)}</span>
          <span class="d-stat-k">tokens</span>
        </span>
      ) : null}
      <span class="d-stat">
        <span class="d-stat-v">{fmtDuration(d.endTime - d.startTime)}</span>
        <span class="d-stat-k">duration</span>
      </span>
    </div>
  );
}

function Actions({
  d,
  isPinned,
  isDiffProject,
  hasOpenTerminal,
  worktree,
}: {
  d: SessionDetail;
  isPinned: boolean;
  isDiffProject: boolean;
  hasOpenTerminal: boolean;
  worktree?: WorktreeRef;
}) {
  // A worktree removed from disk can't be resumed (its checkout path is gone).
  // Offer to recreate it when Claude made it (the host can `git worktree add`
  // it back); a user-made worktree can only be re-added by the user, so we just
  // explain the situation. Handled before the cross-project branch so the
  // recreate affordance shows regardless of which folder is currently open.
  if (worktree && !worktree.exists) {
    const claude = worktree.kind === "claude";
    return (
      <>
        <div class="d-notice">
          <Icon name="circle-alert" />
          <span>
            This {claude ? "Claude " : ""}worktree (<strong>{pathTail(worktree.path)}</strong>) was
            removed from disk.
            {claude
              ? " Recreate it to resume the session there."
              : " Its checkout is gone, so the session can't be resumed in place."}
          </span>
        </div>
        <div class="d-actions">
          {claude ? (
            <Button
              variant="primary"
              iconName="plus"
              title="Recreate the worktree (git worktree add) and resume the session in it"
              onClick={() => sendCreateWorktree(d.id)}
            >
              Recreate worktree
            </Button>
          ) : null}
          <Button iconName="pencil" onClick={() => sendRenameSession(d.id)}>
            Rename
          </Button>
          <Button
            iconName={isPinned ? "pin-off" : "pin"}
            onClick={() => (isPinned ? sendUnpinSession(d.id) : sendPinSession(d.id))}
          >
            {isPinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            iconName="upload"
            title="Save this session as a portable .jsonl"
            onClick={() => sendExportSession(d.id)}
          >
            Export
          </Button>
          <Button class="del" iconName="trash-2" onClick={() => sendConfirmDelete(d.id)}>
            Delete
          </Button>
        </div>
      </>
    );
  }
  if (isDiffProject) {
    return (
      <>
        <div class="d-notice">
          <Icon name="circle-alert" />
          <span>
            This session belongs to <strong>{d.project}</strong>. Open that project to resume.
          </span>
        </div>
        <div class="d-actions">
          <Button variant="primary" iconName="external-link" onClick={() => sendOpenProject(d.projectPath)}>
            Open {d.project}
          </Button>
          {isClaudeCodeExtensionInstalled() ? (
            <Button
              iconName="message-square"
              title="Open the project in a new window and start a Claude Code chat there"
              onClick={() => sendOpenProjectAndChat(d.projectPath)}
            >
              Open &amp; Chat
            </Button>
          ) : null}
          <Button iconName="pencil" onClick={() => sendRenameSession(d.id)}>
            Rename
          </Button>
          <Button
            iconName={isPinned ? "pin-off" : "pin"}
            onClick={() => (isPinned ? sendUnpinSession(d.id) : sendPinSession(d.id))}
          >
            {isPinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            iconName="upload"
            title="Save this session as a portable .jsonl"
            onClick={() => sendExportSession(d.id)}
          >
            Export
          </Button>
          <Button class="del" iconName="trash-2" onClick={() => sendConfirmDelete(d.id)}>
            Delete
          </Button>
        </div>
      </>
    );
  }
  return (
    <div class="d-actions">
      {hasOpenTerminal ? (
        <Button
          variant="primary"
          iconName="terminal"
          title="Focus the open terminal for this session"
          onClick={() => sendViewTerminal(d.id)}
        >
          View
        </Button>
      ) : (
        <Button
          variant="primary"
          iconName="play"
          title={
            worktree && worktree.kind !== "main"
              ? `Resume in worktree ${pathTail(worktree.path)}`
              : undefined
          }
          onClick={() => sendResumeSession(d.id, d.entrypoint, d.projectPath)}
        >
          {worktree && worktree.kind !== "main" ? "Resume in worktree" : "Resume"}
        </Button>
      )}
      <Button iconName="pencil" onClick={() => sendRenameSession(d.id)}>
        Rename
      </Button>
      <Button iconName="git-fork" onClick={() => sendForkSession(d.id)}>
        Fork
      </Button>
      <Button
        iconName={isPinned ? "pin-off" : "pin"}
        onClick={() => (isPinned ? sendUnpinSession(d.id) : sendPinSession(d.id))}
      >
        {isPinned ? "Unpin" : "Pin"}
      </Button>
      <Button iconName="terminal" onClick={() => sendCopyCommand(d.id)}>
        Copy Cmd
      </Button>
      <Button
        iconName="upload"
        title="Save this session as a portable .jsonl"
        onClick={() => sendExportSession(d.id)}
      >
        Export
      </Button>
      <Button class="del" iconName="trash-2" onClick={() => sendConfirmDelete(d.id)}>
        Delete
      </Button>
    </div>
  );
}

export function DetailView() {
  const d = detailSignal.value;
  const loading = detailLoadingSignal.value;
  const [rawQuery, setRawQuery] = useState("");
  const debouncedQuery = useDebounce(rawQuery, DETAIL_SEARCH_DEBOUNCE_MS);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [windowSize, setWindowSize] = useState(MESSAGE_WINDOW);

  const sessionId = d?.id ?? null;
  const mode = d?.detailMode ?? "last";

  // Re-request the transcript whenever the debounced query changes for the
  // open session. Empty query reverts the host to the default paged view.
  useEffect(() => {
    if (!sessionId) return;
    sendGetSessionDetail(sessionId, mode, debouncedQuery.trim());
    setWindowSize(MESSAGE_WINDOW);
  }, [debouncedQuery, sessionId, mode]);

  // Reset the search box + window when switching to a different session.
  useEffect(() => {
    setRawQuery("");
    setWindowSize(MESSAGE_WINDOW);
  }, [sessionId]);

  if (loading || !d) {
    return (
      <div class="panel" id="detailView">
        <BackButton onClick={backToList} />
        <DetailSkeleton />
      </div>
    );
  }

  const date = new Date(d.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const branch = d.branch && d.branch !== "HEAD" ? d.branch : "";
  const currentProject = currentProjectSignal.value;
  const worktrees = worktreesSignal.value;
  const worktree = worktrees[d.id];
  const repoRoot = currentRepoRootSignal.value;
  // A sibling worktree of the current repo is resumable in place, so it is not
  // treated as a "different project" (that would hide Resume and offer "Open").
  const isDiffProject =
    Boolean(currentProject && d.projectKey !== currentProject) &&
    !isSameRepo(d, worktrees, repoRoot);
  const isPinned = pinnedSignal.value.has(d.id);
  // Detail info row only for real (non-main) worktrees — the main checkout is
  // the default and needs no callout.
  const wtInfo = worktree && worktree.kind !== "main" ? worktree : null;
  const wtKindLabel = worktree?.kind === "claude" ? "Claude-created" : "User-created";

  const total = d.totalMessages ?? d.messages.length;
  const activeQuery = debouncedQuery.trim().toLowerCase();
  const isSearching = activeQuery.length > 0;
  const showToggle = total > PAGE_SIZE_FOR_TOGGLE;
  const stale = isSearching && d.detailQuery !== activeQuery;
  const matchCount = d.totalMatches ?? d.messages.length;

  // "Latest" renders newest-first; "Earliest" and search keep chronological
  // order. We carry the original index so copy / ask-again resolve the right
  // message after any reversal.
  const indexed = d.messages.map((m, origIdx) => ({ m, origIdx }));
  const ordered = !isSearching && mode === "last" ? indexed.slice().reverse() : indexed;
  // While searching, `d.messages` already holds only the matches (the host
  // filters the whole transcript), so render all of them — never truncate a
  // match set behind "Show more", which reads as "search didn't find it".
  const effectiveWindow = isSearching ? ordered.length : windowSize;
  const windowed = ordered.slice(0, effectiveWindow);
  const hasMore = !isSearching && ordered.length > windowSize;

  const copy = (index: number): void => {
    const msg = d.messages[index];
    if (msg?.content) {
      void navigator.clipboard?.writeText(msg.content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 900);
    }
  };
  const askAgain = (index: number): void => {
    const msg = d.messages[index];
    if (msg?.content) sendLaunchChatWithPrompt(msg.content);
  };

  return (
    <div class="panel" id="detailView">
      <BackButton onClick={backToList} />

      <div class="d-head">
        <div class="d-title" title={d.name || d.summary}>
          {d.name || d.summary}
        </div>
        {d.name && d.summary ? (
          <div class="d-subtitle" title={d.summary}>
            {d.summary}
          </div>
        ) : null}
        <div class="d-meta">
          <span class="d-meta-pill">{d.project}</span>
          {branch ? (
            <span class="d-meta-pill d-meta-pill-branch">
              <Icon name="git-branch" size={11} /> {branch}
            </span>
          ) : null}
          <span class="d-meta-dot" aria-hidden="true">
            ·
          </span>
          <span>
            {date} at {fmtTime(d.startTime)}
          </span>
        </div>
        <StatStrip d={d} />
        {wtInfo ? (
          <div class={cx("d-worktree", { "d-worktree--missing": !wtInfo.exists })}>
            <div class="d-worktree__title">
              <Icon name={wtInfo.kind === "claude" ? "bot" : "git-branch"} size={13} />
              <span>{wtKindLabel} worktree</span>
              {wtInfo.exists && wtInfo.locked ? (
                <span class="d-worktree__flag" title="git holds a lock — likely in active use">
                  in use
                </span>
              ) : null}
              {!wtInfo.exists ? (
                <span class="d-worktree__flag d-worktree__flag--gone" title="Removed from disk">
                  removed
                </span>
              ) : null}
            </div>
            <div class="d-worktree__row">
              <span class="d-worktree__k">Worktree</span>
              <span class="d-worktree__v" title={wtInfo.path}>
                {wtInfo.path}
              </span>
            </div>
            <div class="d-worktree__row">
              <span class="d-worktree__k">Branch</span>
              <span class="d-worktree__v">{wtInfo.branch || "(detached)"}</span>
            </div>
            <div class="d-worktree__row">
              <span class="d-worktree__k">Repo</span>
              <span class="d-worktree__v" title={wtInfo.repoRoot}>
                {wtInfo.repoRoot}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <Actions
        d={d}
        isPinned={isPinned}
        isDiffProject={isDiffProject}
        hasOpenTerminal={openTerminalsSignal.value.has(d.id) || Boolean(d.isLive)}
        worktree={worktree}
      />

      <div class="d-scroll">
        <div class="d-section">
          <div class="d-msg-header">
            <div class="d-label-row">
              <span class="d-label">Messages ({total})</span>
              {showToggle ? (
                <Segmented<"last" | "first">
                  size="sm"
                  ariaLabel="Message order"
                  value={mode}
                  disabled={isSearching}
                  options={MESSAGE_ORDER_OPTIONS}
                  onChange={(next) => {
                    if (sessionId) sendGetSessionDetail(sessionId, next, activeQuery);
                  }}
                />
              ) : null}
            </div>
            <div class={cx("d-msg-search", { "has-value": isSearching })}>
              <input
                class="d-msg-search-input"
                type="text"
                autocomplete="off"
                spellcheck={false}
                placeholder="Search messages..."
                aria-label="Search messages"
                value={rawQuery}
                onInput={(e) => setRawQuery((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRawQuery("");
                }}
              />
              {isSearching ? (
                <div class="d-msg-search-addon">
                  <span class="d-msg-search-count">{stale ? "…" : `${matchCount}`}</span>
                  <button
                    type="button"
                    class="d-msg-search-clear"
                    title="Clear search"
                    aria-label="Clear search"
                    onClick={() => setRawQuery("")}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {!isSearching && showToggle ? (
            <div class="d-msg-hint">
              {mode === "first"
                ? `Showing first ${d.messages.length} of ${total} messages`
                : `Showing last ${d.messages.length} of ${total} messages · newest first`}
            </div>
          ) : null}
          {isSearching && !stale && d.messages.length === 0 ? (
            <div class="d-msg-hint">No matches.</div>
          ) : null}

          {windowed.map(({ m, origIdx }) => (
            <MessageItem
              key={origIdx}
              message={m}
              index={origIdx}
              query={activeQuery}
              onCopy={copy}
              onAskAgain={askAgain}
              copied={copiedIndex === origIdx}
            />
          ))}

          {hasMore ? (
            <div class="show-more-row">
              <button
                type="button"
                class="show-more-btn"
                onClick={() => setWindowSize((n) => n + MESSAGE_WINDOW)}
              >
                Show more ({ordered.length - windowSize} remaining)
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
