/**
 * Per-account memory of the last quota we saw.
 *
 * The problem it solves is switching blind. Claude Code keeps ONE
 * statusline cache for the machine and stamps no account on it, so the
 * figures on screen always describe whoever is signed in at this moment.
 * Switch profiles and the quota card goes blank until Claude Code runs a
 * turn under the new account — which means the one question the switcher
 * exists to answer ("which of my accounts still has room?") is the one
 * question it cannot answer, and the user finds out only after paying the
 * cost of the switch.
 *
 * So we remember. Every time we read the cache we file the figures under
 * the account that was live, and the switcher reads them back. Nothing
 * here is fetched: this is the same local cache ../quota reads, stored
 * under a different key. No network, no token — see ./quota for why that
 * line is not crossed.
 *
 * What it is NOT: a history. One entry per account, overwritten by
 * anything newer. A time series would need a retention policy, a
 * compaction pass and a UI to justify it, and the switcher only ever asks
 * about the latest.
 */
import * as fs from "fs";
import * as path from "path";
import { QUOTA_HISTORY_FILE } from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";
import { readLiveAccountUuid } from "./profiles";
import type { QuotaResult } from "./quota";
import type { ProfileQuota } from "./types";

export type { ProfileQuota };

export interface QuotaHistoryFile {
  version: 1;
  /** `accountUuid` → last observed quota. */
  accounts: Record<string, ProfileQuota>;
}

/**
 * Entry cap. Accounts are bounded by how many the user actually signs
 * into, but a uuid that never returns would otherwise sit in the file
 * forever. Evicting the oldest capture keeps it to the accounts in use
 * without needing to know which profiles still exist.
 */
const MAX_ACCOUNTS = 20;

/** Read the file. Null when absent, unreadable, or a version we don't know. */
export function readQuotaHistory(): QuotaHistoryFile | null {
  let raw: string;
  try {
    raw = fs.readFileSync(QUOTA_HISTORY_FILE, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const file = parsed as Partial<QuotaHistoryFile>;
  if (file.version !== 1) return null;
  if (typeof file.accounts !== "object" || file.accounts === null) return null;
  return { version: 1, accounts: file.accounts };
}

/** Last known quota for one account, or null when we've never seen it. */
export function readProfileQuota(accountUuid: string): ProfileQuota | null {
  if (!accountUuid) return null;
  return readQuotaHistory()?.accounts[accountUuid] ?? null;
}

/**
 * File `result` under whichever account is live, if it is worth filing.
 *
 * Silently does nothing for a failed read, an unidentifiable account, a
 * capture with no timestamp, or a capture no newer than the one already
 * stored. That last guard is what makes this safe to call from the file
 * watcher: the watcher fires on any touch of the cache, and re-reading an
 * unchanged render must not rewrite the file (nor, worse, let a stale
 * re-read overwrite a newer record after a switch).
 */
export function rememberActiveQuota(result: QuotaResult): void {
  if (!result.ok) return;
  const { quota } = result.data;
  if (!quota.capturedAt) return;
  const capturedMs = Date.parse(quota.capturedAt);
  if (Number.isNaN(capturedMs)) return;

  const accountUuid = readLiveAccountUuid();
  if (!accountUuid) return;

  const history = readQuotaHistory() ?? { version: 1 as const, accounts: {} };
  const previous = history.accounts[accountUuid];
  if (previous && (Date.parse(previous.capturedAt) || 0) >= capturedMs) return;

  history.accounts[accountUuid] = {
    sevenDayPercent: quota.sevenDay?.utilization ?? null,
    fiveHourPercent: quota.fiveHour?.utilization ?? null,
    sevenDayResetsAt: quota.sevenDay?.resetsAt ?? "",
    capturedAt: quota.capturedAt,
  };

  const uuids = Object.keys(history.accounts);
  if (uuids.length > MAX_ACCOUNTS) {
    const oldestFirst = uuids.sort(
      (a, b) =>
        (Date.parse(history.accounts[a].capturedAt) || 0) -
        (Date.parse(history.accounts[b].capturedAt) || 0),
    );
    for (const stale of oldestFirst.slice(0, uuids.length - MAX_ACCOUNTS)) {
      delete history.accounts[stale];
    }
  }

  try {
    fs.mkdirSync(path.dirname(QUOTA_HISTORY_FILE), { recursive: true });
    writeFileAtomic(QUOTA_HISTORY_FILE, JSON.stringify(history));
  } catch {
    // A quota memory is a convenience, never a correctness requirement.
    // A read-only home or a full disk must not break the account switch
    // the user is in the middle of.
  }
}
