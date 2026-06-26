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
 * "Refresh" re-reads the cache; it never forces a server fetch, so it's
 * only as current as Claude Code's last statusline render. The header
 * shows that capture time so the freshness is never misrepresented.
 */

import { Button, Icon } from "../../../../../webview/shared/ui";
import { now } from "../../../../../webview/shared/model";
import type { QuotaError, QuotaSuccess } from "../../../quota";
import type { AccountApi } from "../../api";
import { quotaFreshness } from "../../lib";
import {
  isSectionCollapsed,
  quotaAccountSince,
  quotaStatus,
  setQuotaLoading,
  toggleSection,
} from "../../model";
import { QuotaBar } from "../QuotaBar";
import { SectionHeader } from "../SectionHeader";

export interface QuotaViewProps {
  api: AccountApi;
}

export function QuotaView({ api }: QuotaViewProps) {
  const collapsed = isSectionCollapsed("quota");
  const status = quotaStatus.value;

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
  const liveDot = fresh ? (
    <span
      class={`acct-quota-live-dot${fresh.stale ? " is-stale" : ""}`}
      title={
        fresh.stale
          ? `Idle · last render ${fresh.text}. Updates when Claude runs.`
          : `Live · last render ${fresh.text}`
      }
      aria-label={fresh.stale ? "Quota idle" : "Quota live"}
    />
  ) : null;

  const refreshBtn =
    status.kind === "idle" || status.kind === "loading" ? null : (
      <Button
        variant="icon"
        iconName="refresh-cw"
        title="Re-read latest"
        ariaLabel="Re-read latest quota"
        onClick={refresh}
      />
    );

  return (
    <section class="acct-section">
      <SectionHeader id="quota" title="Quota" collapsed={collapsed} onToggle={toggleSection}>
        {liveDot}
        {refreshBtn}
      </SectionHeader>
      {collapsed ? null : (
        <div class="acct-section-body">
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

function QuotaSwitched({ onRetry }: { onRetry: (e: Event) => void }) {
  return (
    <div class="acct-quota-error" role="status">
      <span class="acct-quota-error-icon">
        <Icon name="refresh-cw" size={16} />
      </span>
      <div class="acct-quota-error-body">
        <div class="acct-quota-error-title">Switched account</div>
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
  // Freshness now lives in the header status dot (beside Refresh), so the
  // body is just the bars — no redundant caption.
  return (
    <div class="acct-quota-bars">
      {fiveHour ? <QuotaBar label="5-hour window" window={fiveHour} /> : null}
      {sevenDay ? <QuotaBar label="7-day window" window={sevenDay} /> : null}
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
