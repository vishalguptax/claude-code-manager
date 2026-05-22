/**
 * Quota section — live subscription utilization. The ONLY network call
 * the extension makes, so it's explicitly opt-in: the idle state shows
 * a "Check quota" CTA rather than auto-loading. Once the user opts in,
 * subsequent tab opens auto-refresh up to the cache TTL (handled in
 * index.tsx).
 *
 * Four states drive the body: idle / loading / success / error. The
 * header carries a freshness stamp + refresh button once data exists.
 */

import { Icon } from "../../../../webview/shared/ui";
import { cx } from "../../../../webview/shared/lib";
import type { QuotaData, QuotaError } from "../../quota";
import type { AccountApi } from "../api";
import {
  isSectionCollapsed,
  quotaOptIn,
  quotaStatus,
  quotaFetchedAtMs,
  setQuotaLoading,
  toggleSection,
} from "../signals";
import { formatFetchedRelative, formatMoney, quotaTone } from "../format";
import { SectionHeader } from "../components/SectionHeader";
import { QuotaBar } from "../components/QuotaBar";

export interface QuotaViewProps {
  api: AccountApi;
}

export function QuotaView({ api }: QuotaViewProps) {
  const collapsed = isSectionCollapsed("quota");
  const status = quotaStatus.value;

  const fetch = (e: Event): void => {
    // The refresh button lives inside the header for layout; stop the
    // click bubbling so it doesn't toggle the section collapse.
    e.stopPropagation();
    quotaOptIn.value = true;
    setQuotaLoading();
    api.fetchQuota();
  };

  const fetchedAt = quotaFetchedAtMs.value;
  const stamp =
    status.kind === "success" && fetchedAt !== null ? (
      <span class="acct-quota-timestamp" title={status.data.fetchedAt}>
        {formatFetchedRelative(status.data.fetchedAt)}
      </span>
    ) : null;

  const refreshBtn =
    status.kind === "idle" ? null : (
      <button
        type="button"
        class={cx("acct-section-head-btn", status.kind === "loading" && "is-spinning")}
        title="Refresh quota"
        aria-label="Refresh quota"
        disabled={status.kind === "loading"}
        onClick={fetch}
      >
        <Icon name="refresh-cw" size={12} />
      </button>
    );

  return (
    <section class="acct-section">
      <SectionHeader id="quota" title="Quota" collapsed={collapsed} onToggle={toggleSection}>
        {stamp}
        {refreshBtn}
      </SectionHeader>
      {collapsed ? null : (
        <div class="acct-section-body">
          <QuotaBody onFetch={fetch} />
        </div>
      )}
    </section>
  );
}

function QuotaBody({ onFetch }: { onFetch: (e: Event) => void }) {
  const status = quotaStatus.value;

  if (status.kind === "idle") {
    return (
      <div class="acct-quota-intro">
        <p class="acct-quota-intro-text">
          See how much of your Claude subscription you've used in the last five hours and the last
          seven days. Uses your own OAuth token — the request goes to <code>api.anthropic.com</code>{" "}
          and nothing else leaves your machine.
        </p>
        <button type="button" class="btn primary" onClick={onFetch}>
          <Icon name="refresh-cw" size={14} /> Check quota
        </button>
      </div>
    );
  }

  if (status.kind === "loading") {
    return (
      <div class="acct-quota-loading" aria-live="polite">
        <span class="acct-quota-spinner" aria-hidden="true" />
        <span>Checking your quota…</span>
      </div>
    );
  }

  if (status.kind === "error") {
    return <QuotaErrorBody error={status.error} onRetry={onFetch} />;
  }

  return <QuotaSuccessBody data={status.data} />;
}

function QuotaSuccessBody({ data }: { data: QuotaData }) {
  return (
    <div class="acct-quota-bars">
      <QuotaBar label="5-hour window" window={data.fiveHour} />
      <QuotaBar label="7-day window" window={data.sevenDay} />
      {data.sevenDayOpus ? <QuotaBar label="7-day Opus" window={data.sevenDayOpus} /> : null}
      {data.sevenDaySonnet ? (
        <QuotaBar label="7-day Sonnet" window={data.sevenDaySonnet} />
      ) : null}
      {data.extraUsage?.enabled ? <ExtraUsage extra={data.extraUsage} /> : null}
    </div>
  );
}

function ExtraUsage({ extra }: { extra: NonNullable<QuotaData["extraUsage"]> }) {
  const used = extra.usedCredits ?? 0;
  const limit = extra.monthlyLimit ?? 0;
  const currency = extra.currency ?? "USD";
  const pct = typeof extra.utilization === "number" ? Math.round(extra.utilization) : null;
  return (
    <div class="acct-quota-row acct-quota-extra">
      <div class="acct-quota-row-head">
        <span class="acct-quota-label">Extra usage (monthly)</span>
        <span class="acct-quota-pct">
          {formatMoney(used, currency)} / {formatMoney(limit, currency)}
        </span>
      </div>
      {pct !== null ? (
        <div
          class="acct-quota-bar"
          role="progressbar"
          aria-label="Extra usage utilization"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div class={cx("acct-quota-bar-fill", `tone-${quotaTone(pct)}`)} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function QuotaErrorBody({ error, onRetry }: { error: QuotaError; onRetry: (e: Event) => void }) {
  const iconName =
    error.kind === "no-credentials" || error.kind === "unauthorized"
      ? "log-in"
      : error.kind === "network"
        ? "wifi-off"
        : "circle-alert";
  return (
    <div class="acct-quota-error" role="alert">
      <span class="acct-quota-error-icon">
        <Icon name={iconName} size={16} />
      </span>
      <div class="acct-quota-error-body">
        <div class="acct-quota-error-title">Couldn't fetch quota</div>
        <div class="acct-quota-error-msg">{error.message}</div>
      </div>
      <button type="button" class="btn" onClick={onRetry}>
        <Icon name="refresh-cw" size={12} /> Try again
      </button>
    </div>
  );
}
