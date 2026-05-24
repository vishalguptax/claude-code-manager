/**
 * Account feature tab — Preact entry point. Mounted lazily by the
 * TabPanel the first time the Account tab is activated.
 *
 * Responsibilities:
 *   - Subscribe to host messages (accountData / quotaData / accountError)
 *     via the shared message bus. Inbound messages are already validated
 *     against the shared valibot schema in `initMessageBus` before they
 *     reach this handler, so we can trust the shapes here.
 *   - Drive the quota auto-fetch policy (opt-in + cache TTL).
 *   - Render Profile / Quota / Usage sections, or loading / error /
 *     empty states.
 *
 * The Account tab is identity-only — Profile, Quota, Usage. Settings +
 * Permissions live in the separate Config tab.
 */

import { useEffect } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { EmptyState, Loading } from "../../../webview/shared/ui";
import type { QuotaResult } from "../quota";
import type { AccountData } from "../types";
import { useAccountApi } from "./api";
import { accountKey } from "./lib";
import {
  accountData,
  accountError,
  clearQuota,
  loading,
  loadPersistedQuotaOptIn,
  QUOTA_CACHE_TTL_MS,
  quotaCacheAgeMs,
  quotaOptIn,
  quotaStatus,
  setQuotaError,
  setQuotaLoading,
  setQuotaSuccess,
} from "./model";
import { ProfileView, QuotaView, UsageView } from "./ui";

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
    if (lastAccountKey !== null && lastAccountKey !== freshKey) {
      clearQuota();
    }
    lastAccountKey = freshKey;
    accountData.value = fresh;
    accountError.value = "";
    loading.value = false;
    // Still opted in → refresh for the new account right away.
    if (quotaOptIn.value && quotaStatus.value.kind !== "loading" && quotaCacheAgeMs() === null) {
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

/**
 * Quota auto-fetch policy, run once on mount. The opt-in is loaded from
 * persisted state first (a previous session's "Check quota" click), so the
 * 100%-local default only blocks the very first time:
 *   1. Not opted in        → idle; user clicks the CTA.
 *   2. Opted in + no cache  → fetch now (a fresh reload has no cached numbers,
 *                             so a persisted opt-in auto-fetches here).
 *   3. Opted in + stale     → keep painted value, refetch silently.
 *   4. Opted in + fresh     → no-op.
 */
function applyQuotaPolicy(send: { fetchQuota: () => void }): void {
  // Honor a remembered opt-in from a prior session before deciding.
  loadPersistedQuotaOptIn();
  if (!quotaOptIn.value) return;
  const age = quotaCacheAgeMs();
  if (age === null) {
    setQuotaLoading();
    send.fetchQuota();
  } else if (age > QUOTA_CACHE_TTL_MS) {
    send.fetchQuota();
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
    applyQuotaPolicy(api);

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
    return <Loading />;
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
      <UsageView data={data} />
    </div>
  );
}
