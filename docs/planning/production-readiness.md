# Production-Readiness Roadmap

**Status:** Draft · **Owner:** Vishal · **Date:** 2026-05-20 · **Scope:** v1.10 → v2.0

Audit of Claude Manager extension across quality, performance, security, and architecture axes. Findings below are verified against the codebase as of commit `6b57641` (v1.10.0). Each item is ranked **P0** (ship-blocker), **P1** (next minor), **P2** (backlog).

The product promise — *100% local, zero telemetry* — is intact and is treated as a hard constraint throughout. Tech-stack changes are evaluated against cost-to-user (bundle size, dependency count) not developer convenience.

---

## TL;DR

Project is healthier than "plain JS" framing suggests. Already on TypeScript strict, Vitest, esbuild, with a working release pipeline. Real gaps are in **enforcement** (no PR-time CI), **scale** (unbounded caches and full-tree postMessage churn), **one critical injection vector**, and **test coverage on webview code**.

Recommend three sequenced phases:

1. **Phase 1 — Hardening (P0, ~1 week):** Fix terminal injection, add PR CI gates, pin Node, dependabot. No new features.
2. **Phase 2 — Scale (P1, ~2 weeks):** Cache eviction, delta postMessages, search-index pruning, esbuild minify. Profile against 5k-session fixture.
3. **Phase 3 — Polish (P2, ~2 weeks):** Webview test coverage, decompose `sessions/viewProvider.ts` (2473 lines), CodeQL, size budgets.

Total: **~5 weeks engineering** to reach a state defensible against the listed risks. No tech-stack swap recommended — current stack is appropriate; gains from changing would not justify churn.

---

## Phase 1 — Hardening (P0)

### 1.1 Terminal command injection · `src/features/sessions/commands.ts:370`

```ts
term.sendText(`git checkout "${sessBranch}" && ${cmd}`);
```

`sessBranch` is parsed from session JSONL `gitBranch` fields. A crafted transcript file with a branch name containing `"` and shell metacharacters executes arbitrary commands when the user clicks "Switch & Resume". File-based attack vector (not webview-injectable), but trivially exploitable by any process that can write to `~/.claude/projects/*/`.

**Fix:** validate `sessBranch` against `^[A-Za-z0-9._/-]+$` and reject otherwise, OR use `child_process` with array args via a wrapper command, OR shell-escape with `'` quoting and `'\''` for embedded single quotes. The validation approach is simpler and matches git's own ref-name rules.

**Effort:** 1 hour incl. test.

### 1.2 PR-time CI gates

Today CI only runs on `main` push (`release.yml`). PRs are unverified before merge.

**Add `.github/workflows/ci.yml`** triggered on `pull_request`:
- `npm ci`
- `npx tsc --noEmit` (no script today — also add `npm run typecheck`)
- `npm test -- --coverage` with Vitest coverage thresholds (start at 70% lines, 60% branches; ratchet upward)
- `npm run build` (catches esbuild errors)
- `npm audit --omit=dev --audit-level=high` (runtime deps only)

**Effort:** 2 hours.

### 1.3 Node version pinned

Today: `engines.node >=18` in `package.json`, hardcoded `node-version: 20` in CI, no `.nvmrc`, no volta.

**Add:**
- `.nvmrc` → `20`
- `engines.node`: `">=20"`
- Matrix CI on Node 20 + 22

**Effort:** 30 min.

### 1.4 Dependabot

No `.github/dependabot.yml`. Supply-chain drift is invisible.

**Add weekly schedule for `npm` and `github-actions` ecosystems**, grouped minor/patch into a single PR per week.

**Effort:** 15 min.

### 1.5 Lint baseline

No ESLint, no Prettier, no Biome. With 96 source files this is sustainable on review discipline, but will not scale as contributors join.

**Recommend Biome** over ESLint+Prettier — single tool, single config, ~10× faster, zero plugin ecosystem to maintain. Bundle-cost to user: zero (devDep). Adoption cost: one autoformat pass.

**Effort:** 3 hours (config + format pass + CI step).

### Phase 1 exit criteria

- [ ] Branch-name validation lands; test added with malicious fixture
- [ ] `ci.yml` blocks merge on typecheck/test/build failure
- [ ] `.nvmrc` and matrix CI
- [ ] Dependabot PRs opening weekly
- [ ] Biome configured, `npm run check` in CI

---

## Phase 2 — Scale (P1)

Reference workload: **5,000 sessions, 100 concurrent live**. Today's hot paths degrade non-linearly past ~1k sessions.

### 2.1 Cache eviction · `src/features/sessions/parser.ts:324, 584, 907`

Three module-scoped Maps (`sessionMetaCache`, `pendingCache`, `orphanCache`) grow with session count. Comments explain why they exist but no LRU, no size cap, no clear-on-reload.

**Fix:** LRU with max ~2,000 entries (covers active working set; older sessions re-parse on demand — cheap given mtime cache). Use a tiny inline LRU (~30 lines) rather than adding `lru-cache` dependency.

**Effort:** 4 hours.

### 2.2 Search index pruning · `src/features/sessions/searchIndex.ts:44`

50 KB × N sessions, no eviction. At 5k = 250 MB resident in extension host. Search is rarely scoped to ancient sessions.

**Fix:** age-based eviction (last-accessed > 30 days drops from index; re-indexed on demand). Same LRU helper as 2.1.

**Effort:** 3 hours.

### 2.3 Delta postMessage · `src/features/sessions/viewProvider.ts:521-526, 771-776`

Today: full grouped session tree serialized to JSON on every file-watcher tick. At 5k sessions × ~1 KB each = 5+ MB per message, multiple per second during active CLI use.

**Fix:** maintain version-stamped session map on the host, send `{added: [...], updated: [...], removed: [...]}` deltas. Webview applies via existing keyed `listDiff`. Initial load remains full snapshot.

**Effort:** 1.5 days. Touches both viewProvider and webview state.

### 2.4 Avoid full reparse on `history.jsonl` heartbeats · `parser.ts:725-870`

CLI writes `history.jsonl` every few seconds while a session is live. Current handler reparses every session. Heartbeat updates only affect one session at a time.

**Fix:** in the file-watcher dispatch, if the changed file is `history.jsonl`, diff against last-seen version and re-parse only the affected session IDs. mtime cache already supports per-session invalidation.

**Effort:** 1 day.

### 2.5 Lazy transcript loading for detail view · `parser.ts:1205`

`parseJsonlFile()` accumulates the entire transcript before rendering 50 visible messages. 50 MB transcripts spike memory.

**Fix:** stream-parse with windowed access — keep last 200 entries plus the indices, load older windows on scroll. Existing JSONL streaming infrastructure supports this.

**Effort:** 1 day.

### 2.6 esbuild `--minify` flag

`package.json:233-234` — no `--minify`. Estimated 10–20% VSIX size reduction.

**Effort:** 5 min + verify source maps still resolve in DevTools.

### 2.7 postMessage runtime validation

Security audit flagged: 40+ message types in `viewProvider.ts:980` are cast via `as` with no runtime narrowing. Webview is trusted (CSP sandboxed) but type drift between host and webview can silently break flows.

**Fix:** define schemas with **valibot** (~2 KB gzip; same API as zod at 1/7th the size). Parse incoming messages on the host side; throw + log on shape mismatch. Generate TS types from schemas so the discriminated union stays in sync.

**Effort:** 1 day for schemas + dispatch refactor.

### 2.8 Async stat caching

`fs.statSync()` × N sessions on each reload is a foot-gun on network mounts (corporate Windows file shares, WSL). Convert hot paths to `fs.promises.stat` with parallel `Promise.all` (capped at ~32 concurrent to avoid file-handle exhaustion).

**Effort:** 4 hours.

### Phase 2 exit criteria

- [ ] Fixture-based perf test: 5k sessions, reload under 500ms after warm cache
- [ ] postMessage payload < 100 KB on incremental updates
- [ ] Extension host RSS stable over 24h with 100 live sessions
- [ ] VSIX size reduction ≥ 15%

---

## Phase 3 — Polish (P2)

### 3.1 Webview test coverage

50 of 96 source files lack co-located tests; webview code is the bulk. CLAUDE.md explicitly forbids this. Vitest + happy-dom is already configured.

**Approach:** test-architect agent generates skeletons per feature; humans fill in non-trivial assertions. Target 80% line coverage on `src/features/*/webview/views/`.

**Effort:** 1 week (incremental — one feature per day).

### 3.2 Decompose `sessions/viewProvider.ts` · 2473 lines

Currently a hidden orchestrator that imports `parseSkills`/`parseCommands`/`parseHooks` (cross-feature violation per CLAUDE.md). Split into:

- `viewProvider.ts` (webview wiring + dispatch only)
- `liveState.ts` (PID polling + heartbeat tracking)
- `messageHandlers.ts` (the 40+ message dispatch switch)
- A neutral host registry for cross-feature parsers (move to `src/extension/registry.ts`)

**Effort:** 2 days. Requires care to avoid behavior drift; lean on existing tests.

### 3.3 Decompose `sessions/parser.ts` · 1503 lines

Same shape: split metadata extraction, history-parse, and session-grouping into sibling files. parser.ts becomes the public facade.

**Effort:** 1 day.

### 3.4 Integration tests with `@vscode/test-electron`

Today's Vitest suite covers units in isolation. Misses: activation failures, command registration regressions, real VS Code API behavior (file watcher dispatch, terminal lifecycle, webview message round-trips).

**Approach:** add `@vscode/test-electron` harness. Smoke suite first — boot VS Code, install extension, open sidebar, fire a representative command, assert no error toast. Expand to per-feature integration tests as bugs surface.

**Effort:** 1 day for harness + smoke; ongoing per-feature.

### 3.5 CodeQL workflow

Free for public repos. Catches a different class of bugs than tests (taint analysis, control flow). Single workflow file from the [actions/codeql-action](https://github.com/github/codeql-action) template.

**Effort:** 1 hour.

### 3.6 Bundle size budgets

Add `size-limit` config: `dist/extension.js` < 400 KB, `dist/webview/main.js` < 250 KB, `dist/webview/main.css` < 50 KB. Fail CI on regression.

**Effort:** 2 hours.

### 3.7 PR + issue templates

Already trivial. Helps community contributors land cleaner PRs as the project grows.

**Effort:** 30 min.

### 3.8 Preact spike (conditional)

Trigger condition: next new feature where vanilla state-management adds >100 lines of boilerplate, OR account tab editor grows past 1500 lines.

**Approach:** add Preact (`preact` only, no `preact/compat` unless needed) as dep. Migrate account tab first (most state-heavy, smallest blast radius). Keep `listDiff` as fallback for other features until migration justified per-feature.

**Verification:** VSIX size delta < 5 KB (gzipped Preact + JSX runtime). CSP unchanged. All happy-dom tests still pass.

**Effort:** 1 week for account tab; pause and reassess before continuing.

### 3.9 Pre-commit hook (optional)

`simple-git-hooks` over Husky — zero install scripts, smaller footprint. Run Biome + typecheck on staged files only via `lint-staged`. Skippable per-dev; not a substitute for CI.

**Effort:** 1 hour.

---

## Tech-Stack Review — explicit non-recommendations

Each of these was considered and rejected. Recording the reasoning so it does not get re-litigated.

| Swap considered | Verdict | Reason |
| --- | --- | --- |
| esbuild → tsup | **Keep esbuild.** | tsup wraps esbuild; adds an indirection without a feature claude-manager uses (no DTS output needed for a closed app). |
| esbuild → Vite | **Keep esbuild.** | Vite shines for dev-server HMR; VS Code webview reloads via extension host restart anyway. Net loss. |
| Vitest → node:test | **Keep Vitest.** | node:test has no happy-dom integration; webview tests would have to fork. |
| Vanilla DOM → Preact in webview | **Defer, don't reject.** | Vanilla correct for v1. Preact (~3 KB gzip) beats React (~45 KB) when migration justified. Trigger: next feature where vanilla state management hurts, OR 8th+ feature added. Spike one feature first (account tab simplest). Reversible per-feature migration. Keep React out — bundle cost without ecosystem benefit (extension uses zero React-only libs). |
| ESLint + Prettier → Biome | **Switch to Biome.** | Already covered in 1.5. Strictly cheaper. |
| `lru-cache` package for 2.1/2.2 | **Inline LRU.** | ~30 LOC vs. an extra dep on every user install. Cost > benefit. |
| Add Sentry / telemetry | **Reject permanently.** | Violates product promise. Document in CLAUDE.md as a no-go. |

---

## Open questions

1. **Coverage threshold ratchet** — start at 70% and ratchet, or set 80% and grandfather existing gaps? Recommend ratchet (less noise).
2. **Phase 2 ordering** — perf fixes will reveal each other (e.g., delta postMessage will mask cache leaks until you 24h-soak). Recommend landing 2.1+2.2+2.6 first, then a baseline measurement, then 2.3+2.4+2.5.
3. **`account/quota.ts` network call** — documented as the only network call; opt-in. Worth surfacing in the README's "100% local" claim with an asterisk so the promise stays accurate.

---

## Out of scope (explicit)

- New features. This roadmap is a hardening exercise.
- UX/a11y review — separate effort, separate doc.
- Marketplace listing rewrite — separate effort.
- Telemetry/analytics — permanently out of scope per product promise.
