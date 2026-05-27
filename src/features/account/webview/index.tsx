/**
 * Account feature tab — Preact entry point. Mounted lazily by the
 * TabPanel the first time the Account tab is activated.
 *
 * Responsibilities:
 *   - Subscribe to host messages (accountData / quotaData / accountError)
 *     via the shared message bus. Inbound messages are already validated
 *     against the shared valibot schema in `initMessageBus` before they
 *     reach this handler, so we can trust the shapes here.
 *   - Read quota from the local statusline cache on mount and on account
 *     switch. Reading is free (no network), so there is no opt-in gate;
 *     the one explicit action is installing the tap, driven from QuotaView.
 *   - Render Profile / Quota / Session / Usage sections, or loading /
 *     error / empty states.
 *
 * The Account tab is identity-only — Profile, Quota, Session, Usage.
 * Settings + Permissions live in the separate Config tab.
 */

import { useEffect } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { EmptyState } from "../../../webview/shared/ui";
import type { QuotaResult } from "../quota";
import type { AccountData } from "../types";
import { useAccountApi } from "./api";
import { accountKey } from "./lib";
import {
  accountData,
  accountError,
  clearQuota,
  loading,
  setQuotaError,
  setQuotaLoading,
  setQuotaSuccess,
} from "./model";
import { AccountSkeleton, LiveView, ProfileView, QuotaView, UsageView } from "./ui";

/** Identity of the account at the last render, for switch detection. */
let lastAccountKey: string | null = null;

/**
 * Apply an inbound host message to the feature signals. Exported for
 * unit testing without standing up the message bus. `send` lets the
 * handler kick a background quota refresh after an account switch.
 */
export function handleAccountMessage(msg: Message, send: { fetchQuota: () => void }): void {
  if (msg.type === "accountData") {
    const fresh = msg.data as AccountData;
    const freshKey = accountKey(fresh);
    // Account switch: identity changed since last render. Drop the
    // stale quota cache so we never show the previous user's numbers.
    const switched = lastAccountKey !== null && lastAccountKey !== freshKey;
    if (switched) {
      clearQuota();
    }
    lastAccountKey = freshKey;
    accountData.value = fresh;
    accountError.value = "";
    loading.value = false;
    // On a detected switch, re-read so we never show the previous
    // account's numbers. The first load is handled by the mount effect,
    // so only act when the identity actually changed.
    if (switched) {
      setQuotaLoading();
      send.fetchQuota();
    }
  } else if (msg.type === "quotaData") {
    const result = msg.result as QuotaResult;
    if (result.ok) setQuotaSuccess(result.data);
    else setQuotaError(result.error);
  } else if (msg.type === "error") {
    loading.value = false;
    accountError.value = msg.message;
  }
}

export default function AccountTab() {
  const api = useAccountApi();

  useEffect(() => {
    const unsubscribe = registerFeatureHandler("account", (msg) => handleAccountMessage(msg, api));
    // quotaData / error are not "account"-prefixed; register them too.
    const unsubQuota = registerFeatureHandler("quota", (msg) => handleAccountMessage(msg, api));
    const unsubErr = registerFeatureHandler("error", (msg) => handleAccountMessage(msg, api));

    loading.value = true;
    api.getAccountData();
    // Quota comes from the local statusline cache — a free read, so we
    // always pull it on mount (no opt-in). The host replies with the
    // not-installed state when the tap isn't wired yet.
    setQuotaLoading();
    api.fetchQuota();

    return () => {
      unsubscribe();
      unsubQuota();
      unsubErr();
    };
    // Mount-once: the api bridge is module-stable, so an empty dep array
    // is correct — re-running would double-register handlers.
  }, []);

  const data = accountData.value;
  if (accountError.value) {
    return <EmptyState title="Couldn't load account" description={accountError.value} />;
  }
  if (loading.value && !data) {
    return <AccountSkeleton />;
  }
  if (!data) {
    return (
      <EmptyState
        title="No account data available"
        description="Make sure Claude Code is installed and you're signed in."
      />
    );
  }

  return (
    <div class="panel">
      <ProfileView data={data} api={api} />
      <QuotaView api={api} />
      <LiveView />
      <UsageView data={data} />
    </div>
  );
}
