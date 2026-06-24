/**
 * Profile section. Two paths:
 *   - signed-out → empty card with Switch-account (when saved profiles
 *     exist) and Log-in affordances.
 *   - signed-in  → avatar + identity, optional corrupted-config banner,
 *     session-expiry / credential-source meta, and account actions.
 *
 * The avatar doubles as a Switch-account button (Gmail/macOS pattern)
 * so the action stays reachable when the user scrolls past the button
 * row.
 */

import { cx } from "../../../../../webview/shared/lib";
import { Button, Icon } from "../../../../../webview/shared/ui";
import type { AccountData } from "../../../types";
import type { AccountApi } from "../../api";
import { formatPlan } from "../../lib";
import { isSectionCollapsed, toggleSection } from "../../model";
import { MetaRow } from "../MetaRow";
import { SectionHeader } from "../SectionHeader";

export interface ProfileViewProps {
  data: AccountData;
  api: AccountApi;
}

export function ProfileView({ data, api }: ProfileViewProps) {
  const collapsed = isSectionCollapsed("profile");
  return (
    <section class="acct-section">
      <SectionHeader id="profile" title="Profile" collapsed={collapsed} onToggle={toggleSection} />
      {collapsed ? null : (
        <div class="acct-section-body">
          {data.profile.signedIn ? (
            <SignedIn data={data} api={api} />
          ) : (
            <SignedOut data={data} api={api} />
          )}
        </div>
      )}
    </section>
  );
}

function SignedOut({ data, api }: ProfileViewProps) {
  const saved = data.savedProfiles;
  const hint =
    saved.length > 0
      ? "Switch to a saved account or log in a new one."
      : "Sign in to Claude Code to view your account.";
  return (
    <div class="acct-empty">
      <div class="acct-empty-title">Not signed in</div>
      <div class="acct-empty-hint">{hint}</div>
      <div class="acct-actions">
        {saved.length > 0 ? (
          <Button
            variant="secondary"
            iconName="refresh-cw"
            title="Switch to a saved Claude account"
            onClick={() => api.openAccountSwitcher()}
          >
            Switch account
          </Button>
        ) : null}
        {/* Secondary, not primary: the Account surface keeps a single primary —
            the Quota section's "Enable live quota" CTA — so the hierarchy stays
            clear (one solid-blue button per visible surface). */}
        <Button variant="secondary" iconName="play" onClick={() => api.launchSlash("/login")}>
          Log in
        </Button>
      </div>
    </div>
  );
}

function SignedIn({ data, api }: ProfileViewProps) {
  const p = data.profile;
  const initial = (p.displayName || p.email || "?").charAt(0).toUpperCase();
  const expiresInDays =
    p.tokenExpiresAt > 0 ? Math.round((p.tokenExpiresAt - Date.now()) / 86400000) : 0;
  const name = p.displayName || p.email || (p.signedIn ? "Signed in" : "Not signed in");
  // Plan label (e.g. "Max 20×", "Team", "Pro") derived locally from the
  // OAuth credential — no network. Shown in the badge beside the name;
  // organization, plan-start date, and credential storage are omitted to
  // keep the profile focused on identity + plan.
  const plan = formatPlan(p.subscriptionType, p.rateLimitTier);
  const hasMeta = expiresInDays > 0;

  return (
    <div class="acct-profile-wrap">
      {p.configCorrupted ? (
        <div class="acct-banner" role="alert">
          <Icon name="circle-alert" size={14} />
          <div class="acct-banner-text">
            <strong>Claude config looks corrupted.</strong>
            <span>
              ~/.claude.json is empty or invalid. Restore from the latest backup to avoid Claude's
              re-login prompt and keep your settings.
            </span>
          </div>
          <Button iconName="refresh-cw" onClick={() => api.restoreClaudeConfig()}>
            Restore
          </Button>
        </div>
      ) : null}

      <div class="acct-profile">
        <button
          type="button"
          class="acct-avatar acct-avatar-btn"
          title="Switch account"
          aria-label="Switch account"
          onClick={() => api.openAccountSwitcher()}
        >
          {initial}
        </button>
        <div class="acct-profile-info">
          <div class="acct-name">{name}</div>
          <div class="acct-email">{p.email}</div>
        </div>
        {plan ? (
          <span class={cx("acct-plan-badge", `plan-${p.subscriptionType}`)} title="Subscription plan">
            {plan}
          </span>
        ) : null}
      </div>

      {hasMeta ? (
        <div class="acct-meta acct-meta-profile">
          <MetaRow
            k="Session expires"
            v={`in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`}
          />
        </div>
      ) : null}

      <div class="acct-actions">
        <Button
          iconName="refresh-cw"
          title="Switch between saved Claude accounts or log in a new one"
          onClick={() => api.openAccountSwitcher()}
        >
          Switch account
        </Button>
        {!data.activeProfileSlug ? (
          <Button
            iconName="save"
            title="Save this account as a profile so you can switch back without re-logging-in"
            onClick={() => api.promptSaveProfile()}
          >
            Save profile
          </Button>
        ) : null}
        <Button variant="danger" iconName="x" onClick={() => api.launchSlash("/logout")}>
          Log out
        </Button>
      </div>
    </div>
  );
}
