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
import type { QuotaError, QuotaSuccess } from "../../../quota";
import type { AccountApi } from "../../api";
import { formatFetchedRelative } from "../../lib";
import { isSectionCollapsed, quotaStatus, setQuotaLoading, toggleSection } from "../../model";
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
  const refresh = (e: Event): void => {
    e.stopPropagation();
    setQuotaLoading();
    api.fetchQuota();
  };

  const install = (e: Event): void => {
    e.stopPropagation();
    setQuotaLoading();
    api.installStatusline();
  };

  // Header freshness reflects when Claude Code last rendered (captured),
  // not when we read the file — that's the figure users care about.
  const captured = status.kind === "success" ? status.data.quota.capturedAt : "";
  const stamp = captured ? (
    <span class="acct-quota-timestamp" title={captured}>
      {formatFetchedRelative(captured)}
    </span>
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
        {stamp}
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

  return <QuotaSuccessBody data={status.data} />;
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
