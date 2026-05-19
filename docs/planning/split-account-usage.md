# Plan — Split `account` feature into `account` + `usage`

**Status:** Planned, not started
**Scope shape:** Two BinaryOS scopes
**Date drafted:** 2026-05-12

## Goal

Split the current `account` feature into two:
- **`account`** — identity, profile, login, multi-account switching (future)
- **`usage`** — tokens, cost, quota, heatmap, per-project stats, model breakdown, future analytics (burn rate, weekly gauge, model-cost trend)

Driver: account tab today mixes identity + analytics; adding burn rate / weekly quota gauge / model-cost trend = bloat. Concerns separate cleanly. GitHub demand signals (#1109, #13585, #23706) confirm power-user need for analytics surface.

## Scope shape

| Scope | Purpose | Risk profile |
|-------|---------|--------------|
| **A: `split-account-usage`** | Mechanical refactor + new Usage tab | Single rollback boundary |
| **B: `usage-analytics`** | Burn rate, weekly gauge, model-cost trend | New product surface |

Ship A first. Confirm no regression on Marketplace. Then B.

## File moves (Scope A)

### Extension-host
| From | To |
|------|----|
| `src/features/account/usage.ts` | `src/features/usage/usage.ts` |
| `src/features/account/quota.ts` | `src/features/usage/quota.ts` |
| `src/features/account/projectStats.ts` | `src/features/usage/projectStats.ts` |
| `src/features/account/snapshots.ts` | `src/features/usage/snapshots.ts` |
| `src/features/account/__tests__/usage.test.ts` | `src/features/usage/__tests__/usage.test.ts` |
| `src/features/account/__tests__/quota.test.ts` | `src/features/usage/__tests__/quota.test.ts` |
| `src/features/account/__tests__/projectStats.test.ts` | `src/features/usage/__tests__/projectStats.test.ts` |

### Webview
| From | To |
|------|----|
| `src/features/account/webview/heatmap.ts` | `src/features/usage/webview/heatmap.ts` |
| `src/features/account/webview/__tests__/heatmap.test.ts` | `src/features/usage/webview/__tests__/heatmap.test.ts` |

### New files
- `src/features/usage/types.ts` — `UsageStats`, `DailyActivity`, `DailyTokens`, `ProjectStats`, `ToolStats`, `McpServerUsage`, `ModelStats`, message union
- `src/features/usage/webview/api.ts` — `initUsageApi`, `sendGetUsageData`, `sendFetchQuota`
- `src/features/usage/webview/state.ts` — usage + quota cache, hydrate, migration
- `src/features/usage/webview/tab.ts` — mount/unmount lifecycle
- `src/features/usage/webview/view.ts` — render
- `src/features/usage/webview/__tests__/{api,state,tab,view}.test.ts`
- `src/styles/usage.css`

### Stays in `account/`
`profile`, `models`, `profiles`, `parser` (slim — no usage call), `state`, `commands`, `types` (slim), `webview/{api,state,tab,view}` (identity only)

## Module boundaries (per CLAUDE.md)

- `features/usage/webview/` MUST NOT import `vscode`
- `features/usage/` host code may import `vscode`
- No `features/account → features/usage` imports or vice versa. Communicate via viewProvider dispatch.

## postMessage contract changes

### Host → webview
- `accountData` — payload slimmed: `{ profile, settings, permissions, availableModels, savedProfiles, activeProfileSlug, settingsSnapshots }`. Account + Config tabs consume.
- `usageData` — NEW. Payload `{ usage: UsageStats, accountKey: string }`. `accountKey` = `slug|email` so Usage tab invalidates quota cache on identity change without importing account state.
- `quotaData` — name unchanged; logical owner moves to usage.
- `accountError` — kept.
- `usageError` — NEW (symmetry).

### Webview → host
- `getAccountData` — kept. Host responds with `accountData` only.
- `getUsageData` — NEW. Host responds with `usageData`.
- `fetchQuota` — kept, behaviour unchanged.

### Type unions
- `account/types.ts` — drop usage-related variants
- `usage/types.ts` — `UsageExtensionMessage`, `UsageWebviewMessage`

## Tab registration

File: `src/webview/main.ts`
- `ALL_TABS` (line 69): insert `"usage"` between `"account"` and `"config"`
- `TAB_LABELS` (line 72): `usage: "Usage"`
- `TAB_ICONS` (line 84): pick `chart-column` / `activity` / `trending-up`
- `tabLifecycle` map (line 220): add `usage: { mount: mountUsage, unmount: unmountUsage }`
- Init (~line 110): `initUsageTab(vscode)`
- `clearQuotaCache` import (line 15) moves account → usage

File: `src/webview/types.ts:19` — extend `Tab` union with `"usage"`
File: `src/webview/icons.ts` — confirm chosen lucide icon exported; add if missing

## CSS

- New `src/styles/usage.css` — rules with selectors `acct-quota*`, `acct-heat*`, `acct-stat*`, `acct-toolbar*`, `acct-breakdown*`, `acct-meta*`, `acct-period-toggle`
- Keep `acct-` prefix this scope. Rename → `usage-` in follow-up.
- Shared collapsible-section rules (`.acct-section*`) — duplicate into both files for now; lift to `components.css` as `.collapse-section` in follow-up.
- `scripts/build-css.js` FILES array: add `"usage.css"` after `"account.css"`.

## Persistence migration

Webview `vscode.setState` (`webview/persistence.ts`):
- `account.quotaOptedIn` → `usage.quotaOptedIn`
- `account.quotaCache` → `usage.quotaCache`
- `account.collapsedSections` → split: `quota`/`usage` entries lift to `usage.collapsedSections`

Implementation: `migrateLegacyAccountKeys()` in `usage/webview/state.ts`, called once from `hydrateFromPersistence()`. Idempotent. Keep 2-3 releases, then delete.

Host `globalState`: no migration needed (`claudeManager.accounts.disclaimerAck` stays in account scope).

## Watcher split

File: `src/features/sessions/viewProvider.ts:169`

- Account debounce: `~/.claude/.credentials.json`, `~/.claude.json`, `~/.claude/settings.json`
- Usage debounce: `~/.claude/stats-cache.json`, `~/.claude/projects/**` JSONL

Two debounces prevents JSONL walk on every credential rotation. Optional polish — can be follow-up.

## Stop parser cross-talk

`parseAccountData` stops calling `computeUsageStats`. Host calls both independently. `getAccountData` handler posts both `accountData` and `usageData`. Honors CLAUDE.md feature-isolation rule.

## Scope A commit order

Each commit green on its own.

1. **Move host files.** Move `usage/quota/projectStats/snapshots` + tests to `features/usage/`. Update imports in `account/parser.ts` (temporary cross-feature import) and `sessions/viewProvider.ts`. Tests pass.
2. **Extract usage types.** Create `usage/types.ts`. Add temporary re-export shim in `account/types.ts` so Config + other consumers don't break this commit.
3. **Add Usage tab webview.** New `usage/webview/{api,state,tab,view,heatmap}.ts` + tests. Wire into `webview/main.ts`, `webview/types.ts`, `scripts/build-css.js`. Add `src/styles/usage.css`. Account tab still renders Usage section (dead path, harmless bisect window).
4. **Cut over rendering.** Drop Usage + Quota sections from `account/webview/view.ts`. Drop `usage` field from `AccountData`. Drop usage helpers from `account/parser.ts`. Host posts both messages.
5. **Persistence migration.** Add `migrateLegacyAccountKeys()`.
6. **Drop type re-export shim.** Final clean state.
7. **Split file watchers.** Optional.

## Risks

1. **Cross-tab identity dep.** Solve via `accountKey` in `usageData` payload (no feature import).
2. **Shared parser.** Stop calling `computeUsageStats` inside `parseAccountData`.
3. **`projectStats.aggregateUsage` memoisation** — safe during transition (single cache, single walk).
4. **Config tab** — consumes only `accountData`, verified no `usage` fields. Unaffected.
5. **`reloadAllBtn` `clearQuotaCache` import** in `main.ts:197` — must move account → usage same commit, else reload stops invalidating quota.
6. **Heatmap component pure** (no DOM) — one-file rename. Importer in moved `view.ts` keeps `./heatmap` relative path.

## Test impact

Per CLAUDE.md "every source file must have tests":

**New required:**
- `usage/webview/state.test.ts` — getters/setters, hydrate, migration, clearQuotaCache (happy-dom)
- `usage/webview/api.test.ts` — postMessage shape per discriminated-union variant
- `usage/webview/tab.test.ts` — mount paints skeleton, `usageData` updates state, account-key change clears cache, unmount removes listener
- `usage/webview/view.test.ts` — DOM queries on fixture render, not innerHTML snapshots

**Moved as-is:** `usage.test.ts`, `projectStats.test.ts`, `quota.test.ts`, `heatmap.test.ts`. Relative imports unchanged (files move alongside).

**Untouched:** `models.test.ts`, `profiles.test.ts`, `snapshots.test.ts` — no usage references.

## Critical files for implementation

- `src/features/sessions/viewProvider.ts` — host message dispatch; sole caller of `parseAccountData`/`fetchQuota`/`computeUsageStats`
- `src/features/account/parser.ts` — entry point that sheds usage
- `src/features/account/types.ts` — discriminated-union surface that splits
- `src/features/account/webview/view.ts` — drops Quota+Usage sections; moved code seeds new `usage/webview/view.ts`
- `src/webview/main.ts` — tab registration, lifecycle, cross-feature import moves
