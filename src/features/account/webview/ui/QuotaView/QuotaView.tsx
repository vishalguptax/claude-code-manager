/**
 * Quota section — rolling 5-hour / 7-day subscription utilization, read
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
 */

import { useState } from "preact/hooks";
import { Button, Icon, SectionHeader } from "../../../../../webview/shared/ui";
import { now } from "../../../../../webview/shared/model";
import type { QuotaError, QuotaSuccess } from "../../../quota";
import type { PromptCacheStats } from "../../../statuslineCore";
import type { AccountApi } from "../../api";
import { formatMissCause, formatNumber, quotaFreshness, weeklyPace } from "../../lib";
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
          <QuotaBody onInstall={install} onRefresh={refresh} />
        </div>
      )}
    </section>
  );
}

function QuotaBody({
  onInstall,
  onRefresh,
}: {
  onInstall: (e: Event) => void;
  onRefresh: (e: Event) => void;
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
      <QuotaNotice error={status.error} onRetry={onRefresh} />
    );
  }

  // After an account switch the global statusline cache may still hold the
  // PREVIOUS account's render (it carries no account id). Suppress any
  // capture taken before the switch so we never present another account's
  // numbers as this one's — a fresh render for the new account clears it.
  const since = quotaAccountSince.value;
  if (since > 0 && Date.parse(status.data.quota.capturedAt) < since) {
    return <QuotaSwitched onRetry={onRefresh} />;
  }

  return <QuotaSuccessBody data={status.data} />;
}

/**
 * Right after a switch the global statusline cache still belongs to the
 * account we left, so there is nothing live to show for this one until
 * Claude Code runs a turn. What we can show is what this account looked
 * like the last time it WAS live — dated, so it never reads as current.
 * Without it the card is blank for exactly as long as the user is most
 * likely to be asking how much room they just switched into.
 */
function QuotaSwitched({ onRetry }: { onRetry: (e: Event) => void }) {
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
      <Button iconName="refresh-cw" onClick={onRetry}>
        Refresh
      </Button>
    </div>
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

function QuotaSuccessBody({ data }: { data: QuotaSuccess }) {
  const { fiveHour, sevenDay } = data.quota;
  if (!fiveHour && !sevenDay) {
    return (
      <p class="acct-quota-intro-text">
        No rate-limit data in the last statusline render. Open a Claude Code session, then refresh.
      </p>
    );
  }
  // The capture-age stamp now lives in the section header (left of the
  // status dot) — see QuotaView's freshnessLabel — so the bars body carries
  // just the bars.
  return (
    <div class="acct-quota-bars">
      {fiveHour ? <QuotaBar label="5-hour window" window={fiveHour} /> : null}
      {sevenDay ? (
        <QuotaBar
          label="7-day window"
          window={sevenDay}
          pace={weeklyPace(sevenDay, data.quota.capturedAt)}
        />
      ) : null}
      <PromptCacheRow stats={data.live.promptCache} />
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

function QuotaNotice({ error, onRetry }: { error: QuotaError; onRetry: (e: Event) => void }) {
  return (
    <div class="acct-quota-error" role="status">
      <span class="acct-quota-error-icon">
        <Icon name="refresh-cw" size={16} />
      </span>
      <div class="acct-quota-error-body">
        <div class="acct-quota-error-title">Waiting for Claude Code</div>
        <div class="acct-quota-error-msg">{error.message}</div>
      </div>
      <Button iconName="refresh-cw" onClick={onRetry}>
        Refresh
      </Button>
    </div>
  );
}
