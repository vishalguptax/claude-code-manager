/**
 * Quota section — rolling 5-hour / 7-day subscription utilization (plus a
 * Claude gateway's spend cap, in dollars, when one is set), read
 * from the local statusline cache (NO network call, NO OAuth token; see
 * ../../../quota). The data originates from Claude Code itself, the
 * authorized client, so this stays inside Anthropic's terms.
 *
 * States: loading / success / error. The errors are call-to-action
 * states, not failures:
 *   - not-installed → "Enable live quota" wires the statusline tap
 *   - no-data       → installed, but Claude hasn't rendered yet
 *   - parse         → cache unreadable
 *
 * "Re-read latest" re-reads the cache; it never forces a server fetch
 * (Anthropic exposes the subscription 5h/7d windows only to the official
 * client, only after a token-consuming turn — there is no compliant
 * on-demand fetch). So the figures are only as current as Claude Code's
 * last statusline render. A freshness caption under the bars states the
 * capture age plainly, and the button briefly spins on click, so the
 * card never reads as broken even when a re-read returns identical
 * numbers.
 *
 * Whenever the card cannot show current figures — no capture yet, an
 * unreadable cache, a capture from before an account switch, or one that
 * has gone idle — it offers "Check /usage": a Claude Code terminal running
 * `/usage`, where the authorized client fetches the live numbers itself.
 * That keeps the extension free of network calls and credentials while
 * still giving the user a current answer on demand.
 */

import { useState } from "preact/hooks";
import {
  Badge,
  Button,
  Icon,
  SectionHeader,
  Tag,
  type BadgeVariant,
} from "../../../../../webview/shared/ui";
import { now } from "../../../../../webview/shared/model";
import type { LiveSession, QuotaError, QuotaSuccess } from "../../../quota";
import type {
  PromptCacheStats,
  StatuslinePullRequest,
  StatuslineWorktree,
} from "../../../statuslineCore";
import type { AccountApi } from "../../api";
import {
  formatMissCause,
  formatNumber,
  formatPrRef,
  formatReviewState,
  formatSpend,
  quotaFreshness,
  weeklyPace,
} from "../../lib";
import { describeProfileQuota } from "../../../profileQuota";
import {
  accountData,
  isSectionCollapsed,
  quotaAccountSince,
  quotaStatus,
  setQuotaLoading,
  toggleSection,
} from "../../model";
import { QuotaBar } from "../QuotaBar";

export interface QuotaViewProps {
  api: AccountApi;
}

export function QuotaView({ api }: QuotaViewProps) {
  const collapsed = isSectionCollapsed("quota");
  const status = quotaStatus.value;

  // Brief spin on the Re-read button so the click always registers.
  // Re-reading an idle cache returns identical numbers (nothing new has
  // rendered), so without this the button looks dead; the spin makes the
  // action visible while the caption below explains why the figures may
  // not change.
  const [rereading, setRereading] = useState(false);

  // Re-read the cache. Stop propagation so the header button doesn't
  // also toggle the section collapse.
  //
  // Only fall back to the loading skeleton when there's nothing to show
  // yet. Tearing live bars down to a spinner on every re-read caused a
  // visible layout shift + flicker (bars → spinner → bars); keeping the
  // current bars in place and swapping the numbers when the reply lands
  // is seamless, and the local cache read is effectively instant anyway.
  const refresh = (e: Event): void => {
    e.stopPropagation();
    setRereading(true);
    setTimeout(() => setRereading(false), 500);
    if (quotaStatus.value.kind !== "success") setQuotaLoading();
    api.fetchQuota();
  };

  // The PR/MR link goes out through the host, never through webview
  // navigation — the CSP forbids the latter outright.
  const openUrl = (url: string): void => api.openUrl(url);

  const checkUsage = (e: Event): void => {
    e.stopPropagation();
    api.launchSlash("/usage");
  };

  const install = (e: Event): void => {
    e.stopPropagation();
    setQuotaLoading();
    api.installStatusline();
  };

  // A single status dot beside Refresh carries the freshness: a live
  // green pulse while Claude is actively rendering, a muted static dot
  // once the capture goes idle. The exact "last render Xm ago" detail
  // lives in its tooltip, so the header stays clean (no timestamp text).
  const captured = status.kind === "success" ? status.data.quota.capturedAt : "";
  // Suppress the live dot for a capture that predates an account switch — the
  // body shows the "switched account" notice in that case, so a green dot
  // would contradict it.
  const preSwitch =
    quotaAccountSince.value > 0 && !!captured && Date.parse(captured) < quotaAccountSince.value;
  // Read the shared clock so the dot re-evaluates live (flips to idle when the
  // capture ages out) instead of freezing at its last-render state.
  const fresh = captured && !preSwitch ? quotaFreshness(captured, now.value) : null;
  // Freshness cluster: a quiet "Updated <age>" stamp with the status dot on
  // its right, grouped as one unit in the header so the capture age reads at a
  // glance (no scrolling to the card's bottom). The stamp is plain text; the
  // live-vs-idle nuance rides the dot's colour + tooltip. Only rendered when
  // there's an in-scope capture, so it vanishes cleanly across an account
  // switch or before the first render.
  const freshness = fresh ? (
    <span class="acct-quota-meta">
      <span class="acct-quota-freshness-inline" aria-live="polite">
        Updated {fresh.text}
      </span>
      <span
        class={`acct-quota-live-dot${fresh.stale ? " is-stale" : ""}`}
        title={
          fresh.stale
            ? `Idle · last render ${fresh.text}. Updates when Claude runs.`
            : `Live · last render ${fresh.text}`
        }
        aria-label={fresh.stale ? "Quota idle" : "Quota live"}
      />
    </span>
  ) : null;

  const refreshBtn =
    status.kind === "idle" || status.kind === "loading" ? null : (
      <Button
        variant="icon"
        iconName="refresh-cw"
        loading={rereading}
        title="Re-read latest"
        ariaLabel="Re-read latest quota"
        onClick={refresh}
      />
    );

  return (
    <section class="section">
      <SectionHeader id="quota" title="Quota" collapsed={collapsed} onToggle={toggleSection}>
        {freshness}
        {refreshBtn}
      </SectionHeader>
      {collapsed ? null : (
        <div class="section-body">
          <QuotaBody
            onInstall={install}
            onRefresh={refresh}
            onCheckUsage={checkUsage}
            onOpenUrl={openUrl}
          />
        </div>
      )}
    </section>
  );
}

function QuotaBody({
  onInstall,
  onRefresh,
  onCheckUsage,
  onOpenUrl,
}: {
  onInstall: (e: Event) => void;
  onRefresh: (e: Event) => void;
  onCheckUsage: (e: Event) => void;
  onOpenUrl: (url: string) => void;
}) {
  const status = quotaStatus.value;

  if (status.kind === "idle" || status.kind === "loading") {
    return (
      <div class="acct-quota-loading" aria-live="polite">
        <span class="acct-quota-spinner" aria-hidden="true" />
        <span>Reading quota…</span>
      </div>
    );
  }

  if (status.kind === "error") {
    return status.error.kind === "not-installed" ? (
      <NotInstalled onInstall={onInstall} message={status.error.message} />
    ) : (
      <QuotaNotice error={status.error} onRetry={onRefresh} onCheckUsage={onCheckUsage} />
    );
  }

  // After an account switch the global statusline cache may still hold the
  // PREVIOUS account's render (it carries no account id). Suppress any
  // capture taken before the switch so we never present another account's
  // numbers as this one's — a fresh render for the new account clears it.
  const since = quotaAccountSince.value;
  if (since > 0 && Date.parse(status.data.quota.capturedAt) < since) {
    return <QuotaSwitched onRetry={onRefresh} onCheckUsage={onCheckUsage} />;
  }

  return (
    <QuotaSuccessBody data={status.data} onCheckUsage={onCheckUsage} onOpenUrl={onOpenUrl} />
  );
}

/**
 * Right after a switch the global statusline cache still belongs to the
 * account we left, so there is nothing live to show for this one until
 * Claude Code runs a turn. What we can show is what this account looked
 * like the last time it WAS live — dated, so it never reads as current.
 * Without it the card is blank for exactly as long as the user is most
 * likely to be asking how much room they just switched into.
 */
function QuotaSwitched({
  onRetry,
  onCheckUsage,
}: {
  onRetry: (e: Event) => void;
  onCheckUsage: (e: Event) => void;
}) {
  const data = accountData.value;
  const active = data?.savedProfiles.find((p) => p.slug === data.activeProfileSlug);
  const remembered = describeProfileQuota(active?.lastQuota ?? null, now.value);
  return (
    <div class="acct-quota-error" role="status">
      <span class="acct-quota-error-icon">
        <Icon name="refresh-cw" size={16} />
      </span>
      <div class="acct-quota-error-body">
        <div class="acct-quota-error-title">
          {remembered ? `Last seen ${remembered}` : "Switched account"}
        </div>
        <div class="acct-quota-error-msg">
          Open Claude Code with this account to load its quota.
        </div>
      </div>
      <div class="acct-quota-error-actions">
        <CheckUsageButton onClick={onCheckUsage} />
        <Button iconName="refresh-cw" onClick={onRetry}>
          Refresh
        </Button>
      </div>
    </div>
  );
}

/**
 * Opens a Claude Code terminal running `/usage`. Secondary on purpose: it
 * leaves the panel for a terminal, so it sits beside Refresh rather than
 * replacing it.
 */
function CheckUsageButton({ onClick }: { onClick: (e: Event) => void }) {
  return (
    <Button
      iconName="terminal"
      title="Open Claude Code and run /usage for live figures"
      onClick={onClick}
    >
      Check /usage
    </Button>
  );
}

function NotInstalled({
  onInstall,
  message,
}: {
  onInstall: (e: Event) => void;
  message: string;
}) {
  return (
    <div class="acct-quota-intro">
      <p class="acct-quota-intro-text">
        Show how much of your 5-hour and 7-day limits you've used — read locally from Claude Code,
        with no network call. Enabling wires Claude Code's statusline to a small tap that caches the
        figures; your existing statusline is preserved, and you can disable it anytime.
      </p>
      <Button variant="primary" iconName="terminal-square" onClick={onInstall}>
        Enable live quota
      </Button>
    </div>
  );
}

function QuotaSuccessBody({
  data,
  onCheckUsage,
  onOpenUrl,
}: {
  data: QuotaSuccess;
  onCheckUsage: (e: Event) => void;
  onOpenUrl: (url: string) => void;
}) {
  const { fiveHour, sevenDay, spendLimit } = data.quota;
  // Behind a Claude gateway the spend cap can be the only window reported,
  // so it alone is enough to show the bars.
  if (!fiveHour && !sevenDay && !spendLimit) {
    return (
      <div class="acct-quota-intro">
        <p class="acct-quota-intro-text">
          No rate-limit data in the last statusline render. Open a Claude Code session, then
          refresh.
        </p>
        <CheckUsageButton onClick={onCheckUsage} />
      </div>
    );
  }
  const stale = quotaFreshness(data.quota.capturedAt, now.value).stale;
  // The capture-age stamp now lives in the section header (left of the
  // status dot) — see QuotaView's freshnessLabel — so the bars body carries
  // just the bars.
  return (
    <div class="acct-quota-bars">
      {fiveHour ? (
        <QuotaBar label="5-hour window" window={fiveHour} />
      ) : sevenDay ? (
        <PendingFiveHourRow />
      ) : null}
      {sevenDay ? (
        <QuotaBar
          label="7-day window"
          window={sevenDay}
          pace={weeklyPace(sevenDay, data.quota.capturedAt)}
        />
      ) : null}
      {spendLimit ? (
        <QuotaBar
          label="Spend limit"
          window={spendLimit}
          figure={spendLimit.usd ? formatSpend(spendLimit.usd) : undefined}
        />
      ) : null}
      {/* The spend cap is left out on purpose: claude.ai's free reset
          applies to the subscription windows, not to a gateway budget. */}
      <LimitResetRow
        nearLimit={[fiveHour, sevenDay].some(
          (w) => !!w && w.utilization >= RESET_HINT_UTILIZATION,
        )}
        onOpenUrl={onOpenUrl}
      />
      {stale ? <StaleUsageRow onCheckUsage={onCheckUsage} /> : null}
      <PromptCacheRow stats={data.live.promptCache} />
      <BranchFacts live={data.live} onOpenUrl={onOpenUrl} />
    </div>
  );
}

/**
 * A plan that reports a 7-day window always has a 5-hour one too, so its
 * absence from a render is not "no such limit": Claude Code only reports a
 * window once it holds rate-limit data for it, and right after the 5-hour
 * window rolls over it has none until the next request. Hiding the row made
 * the limit look gone; saying why keeps the card honest.
 */
function PendingFiveHourRow() {
  return (
    <div class="acct-quota-row">
      <div class="acct-quota-row-head">
        <span class="acct-quota-label">5-hour window</span>
        <span class="acct-quota-pct">—</span>
      </div>
      <div class="acct-quota-sub">
        <span>Not reported yet · Claude shows it after your next message</span>
      </div>
    </div>
  );
}

/**
 * An idle capture keeps its bars — they are still the best local figure —
 * but says plainly that they may lag, and offers the live check. One
 * footnote line: a label, a button and a sentence for a single hint read
 * as a dense block competing with the bars it qualifies.
 */
function StaleUsageRow({ onCheckUsage }: { onCheckUsage: (e: Event) => void }) {
  return (
    <div class="acct-quota-branch">
      <div class="acct-quota-branch-line">
        <span class="acct-quota-branch-note">May lag behind Claude</span>
        <Button
          variant="ghost"
          class="acct-quota-reset-link"
          title="Open Claude Code and run /usage"
          ariaLabel="Check live usage with /usage"
          onClick={onCheckUsage}
        >
          Check /usage
        </Button>
      </div>
    </div>
  );
}

/**
 * At or above this share of either window, point at claude.ai's limit
 * reset. Resets are occasional and cannot be undone, so nudging toward
 * one while the window still has room would spend it too early.
 */
const RESET_HINT_UTILIZATION = 90;

/** Where claude.ai and Claude Desktop offer "Reset for free". */
const CLAUDE_USAGE_URL = "https://claude.ai/settings/usage";

/**
 * Eligible plans occasionally receive a free limit reset (5-hour or
 * weekly), but Anthropic only offers it in claude.ai and Claude Desktop —
 * not in Claude Code, and not through any documented API
 * (support.claude.com/en/articles/17007452). Triggering it ourselves
 * would mean replaying claude.ai's private endpoint with the user's
 * OAuth token, which the Consumer Terms and Claude Code's credential
 * policy forbid regardless of whether a click started it. So this is a
 * plain link: the user presses the button on Anthropic's own page.
 *
 * Worded as "may": nothing local tells us whether a reset is on offer.
 */
function LimitResetRow({
  nearLimit,
  onOpenUrl,
}: {
  nearLimit: boolean;
  onOpenUrl: (url: string) => void;
}) {
  if (!nearLimit) return null;
  return (
    <div class="acct-quota-branch">
      <div class="acct-quota-branch-line">
        <span class="acct-quota-branch-label">Limit reset</span>
        <Button
          variant="ghost"
          class="acct-quota-reset-link"
          iconName="external-link"
          title={CLAUDE_USAGE_URL}
          ariaLabel="Open claude.ai usage settings"
          onClick={() => onOpenUrl(CLAUDE_USAGE_URL)}
        >
          claude.ai usage
        </Button>
      </div>
      <div class="acct-quota-branch-note">
        Your plan may have a free reset there. Claude Code can't apply one.
      </div>
    </div>
  );
}

/**
 * Prompt-cache effectiveness for the session that last rendered.
 *
 * Worth its own row because it is the only local signal that explains
 * WHY a window is filling up: a warm prefix served from cache costs a
 * tenth of the same tokens re-read, so a low hit ratio with repeated
 * rebuilds is the difference between a cheap session and an expensive
 * one. Renders nothing until Claude has reported it.
 *
 * Styled deliberately quieter than the bars above it. It used to copy the
 * quota row's head exactly — same size, weight and colour, same figure in
 * the same right-hand slot — which made it read as a fourth window that
 * had lost its bar, and worse, inverted the meaning of that slot: a quota
 * at 98% means nearly blocked, a cache at 98% means working beautifully.
 * This is a footnote to the bars, so it is set like one.
 *
 * And it only appears when it has something to say. A healthy cache is
 * the overwhelmingly common case, so a permanent "98% hit" was a constant
 * that carried no information and took up the bottom of the card — the
 * same reason the pace line stays silent on a week that holds. The row
 * earns its place when the cache is actually costing the user tokens.
 */

/**
 * Above this the cache is doing its job and there is nothing to report.
 * Warm Claude Code sessions sit at 95–99%; below that, better than one
 * request in twenty is re-sending the whole cached prefix, which is a
 * real and visible drag on the windows above.
 */
const CACHE_HEALTHY_HIT_RATIO = 0.95;

function PromptCacheRow({ stats }: { stats: PromptCacheStats | null }) {
  if (!stats || stats.requests === 0) return null;
  if (stats.hitRatio >= CACHE_HEALTHY_HIT_RATIO) return null;
  const pct = Math.round(stats.hitRatio * 100);
  const wasted = stats.missRecacheTokens;
  const detail: string[] = [`${stats.requests} requests`];
  if (stats.misses > 0) detail.push(`${stats.misses} missed`);
  if (stats.expectedRebuilds > 0) {
    detail.push(`${stats.expectedRebuilds} rebuilt`);
  }
  if (wasted > 0) detail.push(`${formatNumber(wasted)} tokens re-cached`);
  const missCause = formatMissCause(stats.lastMissCause);
  // Plain-language gloss, because every term on this row is jargon:
  // "hit", "missed", "re-cached" mean nothing without it, and the figure
  // is only actionable once you know which direction is good.
  const explain =
    "Share of each request served from Claude's prompt cache instead of " +
    "being sent again. Higher is cheaper, and a miss rebuilds the whole " +
    "cached prefix — those re-cached tokens count towards the windows " +
    "above." +
    (missCause ? ` Last miss: ${missCause}.` : "");
  return (
    <div class="acct-quota-cache">
      <div class="acct-quota-cache-head">
        <span class="acct-quota-cache-label">
          Prompt cache{stats.ttl ? ` (${stats.ttl})` : ""}
        </span>
        <span class="acct-quota-cache-value">{pct}% hit</span>
        <span class="acct-quota-info" role="img" tabIndex={0} title={explain} aria-label={explain}>
          <Icon name="info" size={12} />
        </span>
      </div>
      <div class="acct-quota-cache-detail">{detail.join(" · ")}</div>
    </div>
  );
}

/**
 * Where this session is working: its worktree and the open PR / MR on
 * its branch. Both come straight from Claude Code's statusline payload,
 * which resolves them against git and the forge — the PR in particular is
 * something we could not derive ourselves without a network call, and
 * there will never be one here. The repository itself is not shown: it is
 * the open workspace, so naming it under the quota bars only repeated it.
 *
 * Set as a footnote under the bars, in the same register as the
 * prompt-cache row: these are orientation facts, not figures, and must
 * not compete with the utilization they sit beneath. The whole block
 * disappears when the payload carries neither, which is the common
 * case — an ordinary session, no worktree, no open PR.
 */
function BranchFacts({
  live,
  onOpenUrl,
}: {
  live: LiveSession;
  onOpenUrl: (url: string) => void;
}) {
  const { pr, worktree } = live;
  if (!pr && !worktree) return null;
  return (
    <div class="acct-quota-branch">
      {worktree ? <WorktreeLine worktree={worktree} /> : null}
      {pr ? <PrLine pr={pr} onOpenUrl={onOpenUrl} /> : null}
    </div>
  );
}

function WorktreeLine({ worktree }: { worktree: StatuslineWorktree }) {
  return (
    <div class="acct-quota-branch-line">
      <span class="acct-quota-branch-label">Worktree</span>
      {/* The same pill Sessions uses for a worktree, so the two tabs name
          the same thing the same way. `detail` carries the branch. */}
      <Tag
        variant="worktree"
        icon="git-branch"
        text={worktree.name}
        detail={worktree.branch || undefined}
        title={worktree.path || undefined}
      />
      {/* "Which branch was I on before?" is the question a worktree
          session actually raises, and once Claude has moved, nothing else
          on screen still answers it. */}
      {worktree.originalBranch ? (
        <span class="acct-quota-branch-note">was on {worktree.originalBranch}</span>
      ) : null}
    </div>
  );
}

/**
 * Review states that earn a colour. Everything else — "pending",
 * "draft", and any state a later Claude Code release adds — stays
 * neutral on purpose: a state we cannot interpret must still render,
 * but it must not imply a verdict we did not read.
 */
const REVIEW_STATE_VARIANTS: Record<string, BadgeVariant> = {
  approved: "status",
  changes_requested: "danger",
};

function PrLine({
  pr,
  onOpenUrl,
}: {
  pr: StatuslinePullRequest;
  onOpenUrl: (url: string) => void;
}) {
  // "!123" vs "#123" is GitLab's own convention and the reason Claude
  // Code sends `kind` at all — the number cannot tell the forges apart.
  const ref = formatPrRef(pr);
  const label = pr.kind === "mr" ? "Merge request" : "Pull request";
  return (
    <div class="acct-quota-branch-line">
      <span class="acct-quota-branch-label">{label}</span>
      {pr.url ? (
        <Button
          variant="ghost"
          class="acct-quota-pr"
          iconName="external-link"
          title={pr.url}
          ariaLabel={`Open ${label.toLowerCase()} ${ref}`}
          onClick={() => onOpenUrl(pr.url)}
        >
          {ref}
        </Button>
      ) : (
        // A PR with no URL is still worth naming — the number is how the
        // user finds it — it just cannot be a link.
        <span class="acct-quota-branch-value">{ref}</span>
      )}
      {pr.reviewState ? (
        <Badge
          text={formatReviewState(pr.reviewState)}
          variant={REVIEW_STATE_VARIANTS[pr.reviewState] ?? "default"}
        />
      ) : null}
    </div>
  );
}

function QuotaNotice({
  error,
  onRetry,
  onCheckUsage,
}: {
  error: QuotaError;
  onRetry: (e: Event) => void;
  onCheckUsage: (e: Event) => void;
}) {
  return (
    <div class="acct-quota-error" role="status">
      <span class="acct-quota-error-icon">
        <Icon name="refresh-cw" size={16} />
      </span>
      <div class="acct-quota-error-body">
        <div class="acct-quota-error-title">Waiting for Claude Code</div>
        <div class="acct-quota-error-msg">{error.message}</div>
      </div>
      <div class="acct-quota-error-actions">
        <CheckUsageButton onClick={onCheckUsage} />
        <Button iconName="refresh-cw" onClick={onRetry}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
