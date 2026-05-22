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

import { Icon } from "../../../../webview/shared/ui";
import { cx } from "../../../../webview/shared/lib";
import type { AccountData } from "../../types";
import type { AccountApi } from "../api";
import { isSectionCollapsed, toggleSection } from "../signals";
import { SectionHeader } from "../components/SectionHeader";
import { MetaRow } from "../components/MetaRow";

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
          <button
            type="button"
            class="btn primary"
            title="Switch to a saved Claude account"
            onClick={() => api.openAccountSwitcher()}
          >
            <Icon name="refresh-cw" size={14} /> Switch account
          </button>
        ) : null}
        <button
          type="button"
          class={cx("btn", saved.length === 0 && "green")}
          onClick={() => api.launchSlash("/login")}
        >
          <Icon name="play" size={14} /> Log in
        </button>
      </div>
    </div>
  );
}

function SignedIn({ data, api }: ProfileViewProps) {
  const p = data.profile;
  const initial = (p.displayName || p.email || "?").charAt(0).toUpperCase();
  const expiresInDays =
    p.tokenExpiresAt > 0 ? Math.round((p.tokenExpiresAt - Date.now()) / 86400000) : 0;
  const credLabel = p.credentialSource === "keychain-darwin" ? "macOS Keychain" : "File";
  const credTitle =
    p.credentialSource === "keychain-darwin"
      ? "Tokens stored in macOS Keychain. First read prompts for permission per IDE."
      : "Tokens stored in ~/.claude/.credentials.json (file mode 0600).";
  const name = p.displayName || p.email || (p.signedIn ? "Signed in" : "Not signed in");

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
          <button type="button" class="btn" onClick={() => api.restoreClaudeConfig()}>
            <Icon name="refresh-cw" size={12} /> Restore
          </button>
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
        {p.subscriptionType ? (
          <span class={cx("acct-plan-badge", `plan-${p.subscriptionType}`)}>
            {p.subscriptionType}
          </span>
        ) : null}
      </div>

      {expiresInDays > 0 || p.credentialSource ? (
        <div class="acct-meta">
          {expiresInDays > 0 ? (
            <MetaRow
              k="Session expires"
              v={`in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`}
            />
          ) : null}
          {p.credentialSource ? (
            <MetaRow k="Credentials" v={credLabel} title={credTitle} />
          ) : null}
        </div>
      ) : null}

      <div class="acct-actions">
        <button
          type="button"
          class="btn"
          title="Switch between saved Claude accounts or log in a new one"
          onClick={() => api.openAccountSwitcher()}
        >
          <Icon name="refresh-cw" size={14} /> Switch account
        </button>
        {!data.activeProfileSlug ? (
          <button
            type="button"
            class="btn"
            title="Save this account as a profile so you can switch back without re-logging-in"
            onClick={() => api.promptSaveProfile()}
          >
            <Icon name="save" size={14} /> Save profile
          </button>
        ) : null}
        <button type="button" class="btn del" onClick={() => api.launchSlash("/logout")}>
          <Icon name="x" size={14} /> Log out
        </button>
        <button
          type="button"
          class="btn"
          onClick={() => api.openAccountUrl("https://claude.ai/settings")}
        >
          <Icon name="external-link" size={14} /> Open claude.ai
        </button>
      </div>
    </div>
  );
}
