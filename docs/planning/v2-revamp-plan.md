# Claude Manager v2.0 — Big-Bang Preact Revamp Plan

**Status:** Draft · **Owner:** Vishal · **Date:** 2026-05-20 · **Target:** v2.0.0 · **Estimated effort:** 10–12 weeks across multiple parallel sessions

This document is the **single source of truth** for the v2 revamp. Multiple Claude sessions will execute it in parallel. Conflict avoidance is enforced via **per-session file allowlists** and **git worktrees**. No session may touch a file outside its allowlist. Every session reads this doc first and references it by section number in commit messages.

---

## 0. Constraints (non-negotiable)

1. **100% local, zero telemetry** — no analytics, no error tracking, no network calls beyond the existing opt-in `account/quota.ts` Anthropic endpoint.
2. **CSP-strict webview** — `default-src 'none'`, nonce-only scripts, no `unsafe-eval`.
3. **Bundle budget** — runtime additions total ≤ 8 KB gzip. Hard CI gate.
4. **No new features in v2.0** — revamp is migration only. New features deferred to v2.1+. If a session feels tempted, the answer is no.
5. **VS Code minimum** — bump from `^1.85.0` to `^1.90.0` (last 18 months; aligns with Preact JSX runtime expectations).
6. **Public API stable** — settings keys (`claudeManager.*`), command IDs, view IDs all preserved. User config from v1 must keep working.

---

## 1. End-state architecture

### 1.1 Final tech stack

| Layer | Tool | Size (gzip) | Reason |
|---|---|---|---|
| Language | TypeScript 6 strict | — | Already there |
| Extension host runtime | Node 20+ | — | VS Code bundled |
| Webview UI | **Preact 10** | 3 KB | Per CLAUDE.md decision |
| Webview state | **@preact/signals** | 1 KB | Reactive, no provider tree |
| Webview classes | **clsx** | 0.3 KB | Conditional classnames |
| postMessage validation | **valibot** | 2 KB | Runtime type narrowing |
| Bundler | esbuild | dev | JSX + code-split + minify |
| Lint + format | **Biome** | dev | Replaces ESLint + Prettier |
| Unit tests | Vitest + happy-dom | dev | Already there |
| Component tests | **@testing-library/preact** | dev | Preact-aware queries |
| Integration tests | **@vscode/test-electron** | dev | Real VS Code boot |
| Bundle budget | **size-limit** | dev | CI gate |
| CSS | Vanilla + tokens.css | — | No Tailwind, no preprocessor |
| Package manager | npm | — | Keep; pnpm marginal |

**Total runtime addition: ~6.3 KB gzip.** Within 8 KB budget.

**Rejected:** Tailwind, Zustand, Vite, SQLite, React, React Router, any telemetry SDK.

### 1.2 Final folder layout

```
src/
├── core/                          # No vscode import. Pure TS.
│   ├── types.ts                   # Shared domain types
│   ├── config.ts                  # Settings reader
│   ├── utils.ts
│   ├── lru.ts                     # NEW — inline LRU (replaces unbounded Maps)
│   ├── pricing.ts
│   ├── mtimeCache.ts
│   ├── plugins.ts
│   └── __tests__/
│
├── extension/                     # Extension host only. Owns vscode surface.
│   ├── extension.ts               # activate/deactivate
│   ├── html.ts                    # Webview HTML + CSP + nonce
│   ├── workspace.ts
│   ├── git.ts
│   ├── terminal.ts                # Includes branch-name validation (security fix)
│   ├── claudeCodeExtension.ts
│   ├── ephemeralSession.ts
│   ├── registry.ts                # NEW — cross-feature parser registry
│   └── __tests__/
│
├── shared/                        # NEW — cross-cutting code shared host↔webview
│   ├── protocol/
│   │   ├── messages.ts            # Discriminated union of ALL postMessage types
│   │   ├── schemas.ts             # valibot schemas (1:1 with messages.ts)
│   │   └── __tests__/
│   └── types/
│       └── feature.ts             # Feature interface contract
│
├── features/
│   ├── account/
│   │   ├── parser.ts              # Host
│   │   ├── state.ts               # Host
│   │   ├── commands.ts            # Host
│   │   ├── viewProvider.ts        # Host (slimmed, dispatches to handlers)
│   │   ├── messageHandlers.ts     # NEW — message dispatch logic
│   │   ├── types.ts               # Feature-local types
│   │   ├── __tests__/
│   │   └── webview/               # Browser (Preact). NO vscode import.
│   │       ├── index.tsx          # Feature entry — mounts tab
│   │       ├── api.ts             # Typed postMessage wrappers
│   │       ├── signals.ts         # Feature signals
│   │       ├── components/        # Leaf components
│   │       ├── views/             # ListView, DetailView
│   │       ├── hooks/             # Feature-specific hooks
│   │       └── __tests__/
│   ├── sessions/                  # Same shape
│   ├── skills/
│   ├── commands/
│   ├── hooks/
│   ├── mcp/
│   └── agents/
│
├── webview/                       # Shared webview infra. Browser only.
│   ├── main.tsx                   # Entry — mounts <App />, acquires vscode
│   ├── App.tsx                    # Root component, tab router
│   ├── tabs/                      # Tab system
│   │   ├── TabBar.tsx
│   │   ├── TabPanel.tsx
│   │   └── tabRegistry.ts         # Feature → tab mapping
│   ├── components/                # Shared primitives
│   │   ├── Button.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Icon.tsx
│   │   ├── Input.tsx
│   │   ├── ListItem.tsx
│   │   ├── Loading.tsx
│   │   ├── Modal.tsx
│   │   └── VirtualList.tsx        # NEW — fixes 5k-session scale
│   ├── hooks/
│   │   ├── useApi.ts              # postMessage wrapper
│   │   ├── useDebounce.ts
│   │   ├── useTheme.ts
│   │   └── useVirtualizer.ts
│   ├── signals/
│   │   ├── globalSignals.ts       # activeTab, theme, ready
│   │   └── messageBus.ts          # Routes incoming messages to feature signals
│   ├── icons/                     # SVG components
│   └── utils/
│       ├── esc.ts                 # Kept for any innerHTML fallback
│       ├── format.ts              # Date, size, number
│       └── classnames.ts          # clsx re-export
│
├── styles/
│   ├── tokens.css                 # CSS variables — single source of truth
│   ├── base.css                   # Reset, typography
│   ├── components.css             # Shared component styles
│   ├── tabs.css
│   ├── account.css                # Per-feature styles
│   ├── sessions.css
│   ├── skills.css
│   ├── commands.css
│   ├── hooks.css
│   ├── mcp.css
│   └── agents.css
│
└── __mocks__/
    ├── vscode.ts
    └── fs.ts

scripts/
├── build-css.js
├── build-extension.mjs            # NEW — replaces inline esbuild flags
├── build-webview.mjs              # NEW — code-split per feature
└── release.*

.github/workflows/
├── ci.yml                         # NEW — PR gates
├── release.yml                    # Existing, lightly updated
└── codeql.yml                     # NEW

.github/
├── dependabot.yml                 # NEW
├── PULL_REQUEST_TEMPLATE.md       # NEW
└── ISSUE_TEMPLATE/                # NEW

dist/
├── extension.js
└── webview/
    ├── main.js
    ├── main.css
    └── chunks/                    # Per-feature code split
```

### 1.3 Boundary rules (enforced by Biome rules + CI grep)

- `src/core/**` → MUST NOT import `vscode`, Node built-ins
- `src/extension/**` → owns `vscode`
- `src/shared/**` → MUST NOT import `vscode`, Node built-ins, `preact`
- `src/features/*/{parser,state,commands,viewProvider,messageHandlers}.ts` → host context; may import `vscode`
- `src/features/*/webview/**` → browser context; MUST NOT import `vscode` or Node built-ins
- `src/webview/**` → browser context; MUST NOT import `vscode` or Node built-ins
- Features MUST NOT import other features (use `src/extension/registry.ts` for cross-feature access)
- All postMessage shapes MUST come from `src/shared/protocol/messages.ts`

### 1.4 Message protocol (single source of truth)

```ts
// src/shared/protocol/messages.ts
export type Message =
  | { type: "ready"; payload: { version: string } }
  | { type: "sessions.list"; payload: SessionsListPayload }
  | { type: "sessions.detail"; payload: SessionsDetailPayload }
  | { type: "sessions.delete"; payload: { sessionId: string } }
  // ... ~50 total
  ;

export type HostMessage = Extract<Message, { type: `${string}.list` | `${string}.detail` | "ready" }>;
export type WebviewMessage = Exclude<Message, HostMessage>;
```

Host parses incoming messages with valibot schemas. Webview parses incoming with valibot schemas. Shape drift = thrown error at runtime + caught in tests.

---

## 2. Parallel execution model

### 2.1 Worktree-per-session

Each Claude session runs in its own git worktree to avoid file lock conflicts on Windows:

```powershell
git worktree add ../claude-manager-foundation v2/foundation
git worktree add ../claude-manager-account v2/feat-account
git worktree add ../claude-manager-sessions v2/feat-sessions
# ... one per session
```

Branch naming convention:
- `v2/foundation` — phase F1 only (single session, blocking)
- `v2/feat-{feature}` — phase F2 feature migrations (parallel)
- `v2/host-{feature}` — phase F2 host-side decomposition (parallel)
- `v2/integration` — phase F3 only (single session, blocking)
- `v2/main` — integration target; all branches merge here; `v2/main` → `main` only at release

### 2.2 File ownership matrix

| Path | Owner phase | Owner session | Other sessions |
|---|---|---|---|
| `package.json`, `tsconfig.json`, `biome.json` | F1 | foundation | **READ-ONLY** |
| `esbuild.*`, `scripts/build-*.mjs` | F1 | foundation | **READ-ONLY** |
| `src/extension/html.ts` (CSP) | F1 | foundation | **READ-ONLY** |
| `src/shared/protocol/messages.ts` | F1 + F3 | foundation, integration | **READ-ONLY in F2; APPEND-ONLY via PR review** |
| `src/shared/protocol/schemas.ts` | F1 + F3 | foundation, integration | **READ-ONLY in F2; APPEND-ONLY via PR review** |
| `src/webview/main.tsx`, `App.tsx`, tabs/, components/, hooks/, signals/ | F1 | foundation | **READ-ONLY** |
| `src/styles/tokens.css`, `base.css`, `components.css`, `tabs.css` | F1 | foundation | **READ-ONLY** |
| `src/core/**` | F1 | foundation | **READ-ONLY in F2** |
| `src/extension/registry.ts` | F1 + F3 | foundation, integration | **APPEND-ONLY via dedicated PR** |
| `src/features/{F}/**` | F2 | feat-{F} | **NO ACCESS** |
| `src/styles/{F}.css` | F2 | feat-{F} | **NO ACCESS** |
| `src/extension/{F}.ts` | F2 | feat-{F} (if exists) | **NO ACCESS** |
| `.github/workflows/**` | F1 + F3 | foundation, integration | **READ-ONLY** |
| `CHANGELOG.md`, `README.md` | F3 | integration | **READ-ONLY** |

**Append-only protocol for shared schemas:** when an F2 feature session needs to add a new message type, it opens a focused PR that only edits `messages.ts` + `schemas.ts`. PR is reviewed and merged into `v2/main` before the feature work merges. Avoids long-lived schema diffs across many branches.

### 2.3 Phase gates

| Phase | Sessions | Blocking | Must complete before next |
|---|---|---|---|
| F0 — Spike | 1 | Yes | Validates Preact + CSP + esbuild before committing |
| F1 — Foundation | 1 | Yes | All F2 sessions blocked until F1 ships |
| F2a — Host decomposition | 1 (sessions feature) | No | Can run parallel with F2b |
| F2b — Feature migrations | 6 parallel | No | All must merge before F3 |
| F3 — Integration | 1 | Yes | Before release |
| F4 — Release | 1 | Yes | Final |

### 2.4 Conflict prevention rules (for every session)

1. **First action of every session:** `git fetch origin && git pull origin v2/main --rebase` then verify on correct worktree.
2. **Read this doc, find your section**, confirm your file allowlist.
3. **Never touch a file outside your allowlist** without opening an explicit shared-file PR.
4. **No formatting passes** outside files you own (Biome runs on commit; do not autoformat the world).
5. **No package.json edits** outside Foundation. If you need a dep, request via shared-dep PR to Foundation owner.
6. **Commit message convention:** `feat({phase}/{feature}): ...` — e.g. `feat(F2/account): port list view to Preact`. Lets the integration session reconstruct merge order.
7. **PR base:** always `v2/main`, never `main`.
8. **Force-push to your branch only.** Never to `v2/main`.
9. **Cross-feature imports remain forbidden.** If feature A needs data from feature B, request it via `src/extension/registry.ts` host registration (Foundation provides scaffold).
10. **No `// TODO(v2.1)` in code** — track follow-ups in `docs/planning/v2.1-backlog.md`.

---

## 3. Phase F0 — Spike (1 session, ~3 days)

**Goal:** validate that Preact + JSX + CSP + esbuild + signals all work together before committing to revamp. Throwaway code; merges to nothing.

**Branch:** `v2/spike` (deleted after F0 complete)

**Deliverables:**
1. Minimal `dist/webview/main.js` built with Preact + JSX runtime
2. CSP-compatible mount in a stub webview opened by extension
3. Signals → DOM update demonstrated
4. Valibot parsing demonstrated for one round-trip
5. Bundle size measured

**Exit gate:** Vishal eyeballs the spike webview, confirms theme integration looks right, signs off. If any step fails, revisit tech stack choice.

---

## 4. Phase F1 — Foundation (1 session, ~5 days)

**Branch:** `v2/foundation` → merges to `v2/main` to seed it.

### 4.1 Tasks

1. **Dependencies**
   ```bash
   npm install preact @preact/signals valibot clsx
   npm install -D @biomejs/biome @vscode/test-electron @testing-library/preact size-limit
   ```

2. **`tsconfig.json`** — enable JSX:
   ```json
   {
     "compilerOptions": {
       "jsx": "react-jsx",
       "jsxImportSource": "preact"
     }
   }
   ```
   Also `lib: ["ES2022", "DOM"]`, keep strict, add `noUncheckedIndexedAccess`.

3. **`biome.json`** — lint + format rules. Boundary rules expressed via `noRestrictedImports`.

4. **`scripts/build-extension.mjs`** — esbuild for host (CJS, target node20, minify, external vscode).

5. **`scripts/build-webview.mjs`** — esbuild for webview:
   - Entry: `src/webview/main.tsx`
   - Format: ESM with code-split per feature (not IIFE — use ESM modules + dynamic import)
   - Target: chrome120 (VS Code 1.90 minimum)
   - JSX: automatic, `preact` import source
   - Splitting: enabled, chunks dir `dist/webview/chunks/`
   - Minify: true
   - Source maps: external

6. **`src/extension/html.ts`** — CSP update for ESM + chunks:
   ```ts
   const csp = [
     `default-src 'none'`,
     `style-src ${cspSource} 'unsafe-inline'`,  // VS Code theme requires
     `script-src 'nonce-${nonce}'`,
     `font-src ${cspSource}`,
     `img-src ${cspSource} https: data:`,
     `connect-src 'none'`,
   ].join("; ");
   ```
   Update `<script type="module" nonce>` tag.

7. **`src/shared/protocol/messages.ts`** — extract every existing postMessage type from current code into one discriminated union. Document every message.

8. **`src/shared/protocol/schemas.ts`** — valibot schema per message variant. Generic `parseMessage(unknown): Message` helper.

9. **`src/extension/registry.ts`** — cross-feature registry. Each feature registers a `FeatureContribution` (parsers it owns) at activation; sessions feature reads from registry instead of importing siblings.

10. **`src/core/lru.ts`** — inline LRU helper (~30 LOC) replacing unbounded Maps.

11. **Webview shell** (`src/webview/`):
    - `main.tsx` — acquires vscode API, mounts `<App />`, sets up message bus
    - `App.tsx` — tab router driven by `globalSignals.activeTab`
    - `tabs/TabBar.tsx`, `TabPanel.tsx`, `tabRegistry.ts`
    - `components/` — Button, Icon, EmptyState, ErrorBoundary, Loading, ListItem, Modal, VirtualList
    - `hooks/` — useApi, useDebounce, useTheme, useVirtualizer
    - `signals/globalSignals.ts`, `signals/messageBus.ts`
    - Stub each feature tab with `<EmptyState>Not migrated yet</EmptyState>` so the shell loads end-to-end

12. **CSS foundation**:
    - `tokens.css` — every CSS variable used today, consolidated; mapped to VS Code theme vars
    - `base.css` — reset, typography
    - `components.css` — shared primitives
    - `tabs.css` — tab system

13. **CI workflow** (`.github/workflows/ci.yml`):
    - Trigger: pull_request to `v2/main` and `main`
    - Steps: install → biome check → tsc --noEmit → vitest with coverage → build → size-limit → npm audit (high+)
    - Matrix: Node 20, Node 22

14. **`.github/dependabot.yml`** — weekly npm + github-actions.

15. **`.nvmrc`** — `20`; bump `engines.node` to `>=20`.

16. **Security fix** — `src/extension/terminal.ts`: add `validateGitRef(name): string | null` and apply at `src/features/sessions/commands.ts:370`. Test with malicious fixture.

17. **`size-limit` config** — budgets:
    - `dist/extension.js`: 400 KB
    - `dist/webview/main.js`: 60 KB (shell only; features lazy-load)
    - Each `dist/webview/chunks/{feature}.js`: 50 KB
    - `dist/webview/main.css`: 50 KB

### 4.2 Foundation session exit gate

- [ ] All 17 tasks complete
- [ ] `npm run build` succeeds
- [ ] `npm test` green with new mocks
- [ ] CI passes on `v2/foundation` PR
- [ ] Bundle sizes within budget
- [ ] Stub webview opens; tab bar visible; clicking a tab shows "Not migrated yet"
- [ ] CSP report-only test confirms no violations on stub
- [ ] Branch-name security fix lands with test

---

## 5. Phase F2 — Migration (parallel sessions, ~5 weeks total wall time)

After F1 merges to `v2/main`, F2 sessions launch in parallel. Each migrates one feature.

### 5.1 Session allocation

| Session | Branch | Feature | Estimated days |
|---|---|---|---|
| F2-account | `v2/feat-account` | account | 4 |
| F2-hooks | `v2/feat-hooks` | hooks | 3 |
| F2-mcp | `v2/feat-mcp` | mcp | 3 |
| F2-commands | `v2/feat-commands` | commands | 3 |
| F2-skills | `v2/feat-skills` | skills | 4 |
| F2-agents | `v2/feat-agents` | agents | 4 |
| F2-sessions | `v2/feat-sessions` | sessions | 10 (biggest) |
| F2-host-decompose | `v2/host-decompose` | viewProvider+parser split | 5 (parallel to features) |

Total parallel wall time: ~10 days (sessions feature is critical path).

### 5.2 Per-feature session contract

**Input contract (what Foundation provides):**
- `src/shared/protocol/messages.ts` with this feature's message types declared
- `src/shared/protocol/schemas.ts` with valibot schemas
- `src/webview/` shell with feature tab slot reserved
- `src/styles/{feature}.css` empty file ready
- Host-side `viewProvider.ts` still uses old vanilla approach (works as-is); webview will be replaced

**Output contract (what session delivers):**
- `src/features/{F}/webview/` fully Preact, no vanilla DOM left
- `src/features/{F}/webview/__tests__/` ≥ 80% line coverage on views + components
- `src/features/{F}/webview/api.ts` uses typed postMessage helpers from shared protocol
- Host-side `viewProvider.ts` updated to send/receive validated messages
- `src/features/{F}/messageHandlers.ts` extracted (no more 1000-line dispatch switches)
- `src/styles/{F}.css` filled; no inline styles in TSX
- All cross-feature imports removed (use registry)
- CHANGELOG entry added to `docs/releases/v2.0.0-WIP.md`

**File allowlist for session:**
- ALL files under `src/features/{F}/`
- `src/styles/{F}.css`
- `src/extension/{F}.ts` if exists (only this feature's host extension file)
- `src/extension/registry.ts` — APPEND-ONLY (only add `registerFeature("{F}", ...)`)
- `src/shared/protocol/messages.ts` — APPEND-ONLY via shared-schema PR (see §2.4)
- `src/shared/protocol/schemas.ts` — APPEND-ONLY via shared-schema PR
- `docs/releases/v2.0.0-WIP.md` — APPEND-ONLY (CHANGELOG entry)

**Denylist (ABSOLUTE):**
- Any other feature's directory
- `src/core/**`
- `src/extension/` except own feature file
- `src/webview/**` (shared shell)
- `package.json`, `tsconfig.json`, `biome.json`, `esbuild.*`
- `.github/**`

**Per-feature exit gate:**
- [ ] Old vanilla webview files deleted
- [ ] New Preact webview files added
- [ ] All postMessage types validated via valibot
- [ ] Component tests written + passing
- [ ] Integration smoke (via @vscode/test-electron) passes for this feature
- [ ] Bundle size for `chunks/{F}.js` within 50 KB budget
- [ ] No imports from other features
- [ ] Biome clean
- [ ] CI green on PR

### 5.3 Migration recipe (per feature)

Each F2 session follows the same recipe. Documented once here; not repeated per feature.

1. **Read existing feature** — understand current parser, state, viewProvider, webview structure.
2. **List all postMessage types** sent/received by this feature.
3. **Open shared-schema PR** — add types + valibot schemas to shared protocol. Get merged before continuing.
4. **Pull updated `v2/main`** to your worktree.
5. **Write Preact views** — `webview/views/ListView.tsx`, `DetailView.tsx`, etc.
6. **Write Preact components** — leaf items, modals, forms.
7. **Wire signals** — `webview/signals.ts` for feature state; subscribe in views.
8. **Replace api.ts** — use `useApi()` hook + valibot-validated sends.
9. **Write tests** — happy-dom + @testing-library/preact for views; pure unit tests for parsers.
10. **Update host messageHandlers** — accept validated payloads; reject malformed with logged error.
11. **Delete old vanilla files** in `webview/`.
12. **Update CSS** — move inline styles to `src/styles/{F}.css`.
13. **Run integration smoke** locally (`npm run test:integration`).
14. **Open PR** with checklist filled in.

### 5.4 F2-host-decompose (parallel with feature sessions)

Splits the 2473-line `sessions/viewProvider.ts` and 1503-line `sessions/parser.ts`. Runs parallel with F2-sessions but on different files within the same feature folder — coordinate via PR comments.

**Files split:**
- `sessions/viewProvider.ts` → `viewProvider.ts` (wiring only, <300 LOC) + `messageHandlers.ts` + `liveState.ts` + `watchers.ts`
- `sessions/parser.ts` → `parser.ts` (facade) + `metaParser.ts` + `historyParser.ts` + `grouping.ts`
- `sessions/searchIndex.ts` → add LRU eviction

**Coordination with F2-sessions:** decomposition lands FIRST on `v2/main`; F2-sessions rebases on top before doing webview migration.

---

## 6. Phase F3 — Integration (1 session, ~5 days)

**Branch:** `v2/integration` → merges to `v2/main`.

### 6.1 Tasks

1. **Verify all F2 PRs merged** to `v2/main` clean.
2. **Cross-feature integration tests** via `@vscode/test-electron`:
   - Boot VS Code with extension installed
   - Open sidebar, switch between all 7 tabs, no errors
   - Resume a session, verify terminal opens
   - Edit a hook, verify file changed
   - etc.
3. **Performance harness:**
   - Generate fixture with 5,000 sessions
   - Measure: cold activation, first-render, search latency, memory after 24h
   - Fail if any regresses >10% vs v1.10 baseline
4. **Decompose remaining oversized files** (anything >400 LOC that survived F2).
5. **CodeQL workflow** (`.github/workflows/codeql.yml`).
6. **PR + issue templates**.
7. **README rewrite** — reflect v2 architecture, keep "100% local" promise prominent.
8. **CHANGELOG.md** — assemble from per-feature `v2.0.0-WIP.md` entries; finalize.
9. **Migration notes** — `docs/migration/v1-to-v2.md` documenting any user-visible changes (should be ~zero).
10. **Beta release** — publish `v2.0.0-beta.1` to a private channel; collect feedback for ~1 week.
11. **Bug-fix passes** based on beta feedback.

### 6.2 F3 exit gate

- [ ] All F2 branches merged + deleted
- [ ] Integration tests pass on all platforms (Windows, macOS, Linux)
- [ ] Perf harness shows no regression vs v1.10
- [ ] Bundle sizes within budget
- [ ] CodeQL clean
- [ ] Beta users report no critical regressions
- [ ] Coverage thresholds met (75% lines, 65% branches)

---

## 7. Phase F4 — Release (1 session, ~1 day)

1. Merge `v2/main` → `main` via PR (squash or merge, not rebase, to preserve phase history).
2. Tag `v2.0.0`, push tag.
3. Existing `release.yml` workflow builds + publishes to VS Code Marketplace + Open VSX.
4. Announce in repo Discussions.
5. Monitor crash reports / issues for 72 hours; hotfix if needed → `v2.0.1`.
6. Delete worktrees: `git worktree prune`.

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CSP breaks with JSX runtime | Med | High | F0 spike validates before commitment |
| Bundle bloat past budget | Med | Med | size-limit CI gate fails build |
| Regression in critical flow (resume session) | High | High | Integration smoke tests + beta channel |
| Long-lived F2 branches drift | Med | Med | Shared-schema PRs land separately; rebase frequently |
| Conflict on shared files | Low | Med | File allowlist + worktrees + denylist enforced |
| Scope creep ("while we're here…") | High | High | Hard rule: no new features in v2.0; backlog them |
| Sessions feature too big for one session | Med | Med | F2-host-decompose splits it first |
| Preact ecosystem lib missing for a need | Low | Low | Fall back to vanilla DOM in that one spot; document |
| User config (`claudeManager.*`) breaks | Med | High | Settings keys frozen; explicit test in F3 |
| Marketplace v2 install bricks existing users | Low | Critical | Beta channel + 72h monitoring; v1.10 stays installable as rollback |

---

## 9. Per-session quickstart prompt template

Use this when starting a new Claude session for a specific phase. Fill in the brackets.

```
You are executing phase [F1/F2-{feature}/F3] of the Claude Manager v2 revamp.

Read first: docs/planning/v2-revamp-plan.md (this is the contract).

Your branch: [v2/{branch-name}]
Your worktree: [../claude-manager-{name}]
Your file allowlist: [list from §2.2 or §5.2]
Your denylist: [list from §2.2 or §5.2]

Phase exit gate: [link to §4.2 / §5.2 / §6.2]

Do NOT:
- Touch any file outside your allowlist
- Add new features
- Bump dependencies without a shared-dep PR
- Force-push to v2/main
- Edit shared schemas inline — open a shared-schema PR

Start with: git fetch && git worktree list to verify you're in the right place.

Read the existing code for your area. Plan in your head. Then execute.

Commit convention: feat(phase/feature): summary
```

---

## 10. Open questions for Vishal

1. **VS Code minimum version bump** — OK to go from `^1.85.0` to `^1.90.0`? Drops users on >18-month-old VS Code.
2. **Beta channel** — distribute beta how? Marketplace pre-release flag, or separate `claude-manager-beta` listing?
3. **Telemetry exception for opt-in quota fetch** — keep as-is, or remove from v2 to honor "100% local" cleanly?
4. **Migration window** — v1.x kept buildable on a `v1-maintenance` branch for hotfixes? Recommend yes for 3 months post-v2.0.

---

## 11. Non-goals (explicitly out of scope for v2.0)

- New features (sidebar plugins API, settings editor UI, etc.) — v2.1+
- Localization / i18n — v2.1+
- Mobile/remote VS Code support — out of scope permanently
- Telemetry of any kind — out of scope permanently
- Replacing esbuild with Vite — esbuild stays
- Adopting React over Preact — Preact stays
- SQLite for session caching — file-based caching with LRU is sufficient

---

## Appendix A — Files Foundation must create (checklist)

Generated from §4.1. Foundation session uses this as a punch list.

- [ ] `package.json` — deps + scripts updated
- [ ] `tsconfig.json` — JSX enabled
- [ ] `biome.json`
- [ ] `.nvmrc`
- [ ] `scripts/build-extension.mjs`
- [ ] `scripts/build-webview.mjs`
- [ ] `src/extension/html.ts` (modify)
- [ ] `src/extension/registry.ts` (new)
- [ ] `src/extension/terminal.ts` (security fix)
- [ ] `src/features/sessions/commands.ts` (security fix call site)
- [ ] `src/core/lru.ts` (new)
- [ ] `src/shared/protocol/messages.ts` (new)
- [ ] `src/shared/protocol/schemas.ts` (new)
- [ ] `src/shared/types/feature.ts` (new)
- [ ] `src/webview/main.tsx`
- [ ] `src/webview/App.tsx`
- [ ] `src/webview/tabs/*`
- [ ] `src/webview/components/*` (10 components)
- [ ] `src/webview/hooks/*` (4 hooks)
- [ ] `src/webview/signals/*`
- [ ] `src/webview/utils/*`
- [ ] `src/styles/tokens.css`
- [ ] `src/styles/base.css`
- [ ] `src/styles/components.css`
- [ ] `src/styles/tabs.css`
- [ ] 7 empty per-feature CSS files
- [ ] `.github/workflows/ci.yml`
- [ ] `.github/dependabot.yml`
- [ ] `size-limit` config block in `package.json`
- [ ] Tests for everything above

Approximate F1 LOC: ~3,500 new + ~200 modified.

---

## Appendix B — Conflict-resolution playbook

If two sessions accidentally touch the same file:

1. **First-merged wins on `v2/main`.**
2. **Second session rebases** their branch on updated `v2/main`.
3. **Conflicts on shared schemas** — defer to integration session; do not resolve in feature branches.
4. **Conflicts on `package.json`** — defer to Foundation session; do not edit in feature branches.
5. **Repeated conflicts on the same file** — file's ownership rule is broken; update §2.2 and assign single owner.

---

End of plan.
