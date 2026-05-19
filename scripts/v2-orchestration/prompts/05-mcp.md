You are executing phase F2 feature migration for the mcp feature.

REQUIRED READING (in order):
1. docs/planning/v2-revamp-plan.md §5 (entire F2 section)
2. docs/planning/v2-revamp-plan.md §5.3 (migration recipe — your step-by-step)
3. src/features/mcp/ — every file
4. src/shared/protocol/messages.ts (F1 declared message types — identify yours)
5. src/shared/protocol/schemas.ts
6. src/webview/App.tsx, tabs/, components/ — understand the shell you mount into
7. src/styles/mcp.css (empty stub created by F1)

PREREQUISITE: confirm F1 merged.
  git log v2/integration-target --oneline | Select-String "feat\(F1\)"
If empty, STOP and exit.

YOUR BRANCH: v2/feat-mcp (off v2/integration-target)

FILE ALLOWLIST:
- src/features/mcp/** (ALL files, create + modify + delete)
- src/styles/mcp.css
- src/extension/registry.ts — APPEND-ONLY (one line to register mcp contribution)
- src/shared/protocol/messages.ts — APPEND-ONLY if you need new message types (commit separately first)
- src/shared/protocol/schemas.ts — APPEND-ONLY paired with messages.ts changes
- docs/releases/v2.0.0-WIP.md — APPEND-ONLY (one bullet under mcp heading)

DENYLIST (ABSOLUTE — do not touch):
- Any other feature folder under src/features/
- src/core/**, src/extension/** (except registry.ts append)
- src/webview/** (shared shell — read only)
- package.json, tsconfig.json, biome.json, esbuild scripts, build-css.js
- .github/**
- src/styles/* except mcp.css

TASKS:

STEP 1 — Audit existing feature:
- List all current files in src/features/mcp/
- List all postMessage types this feature sends/receives (grep for message.type)
- List all DOM render entry points in src/features/mcp/webview/

STEP 2 — Shared protocol:
- For each postMessage type you found, check if F1 already declared it in src/shared/protocol/messages.ts.
- If yes: use existing types. No protocol edits needed.
- If no: append the new variant + valibot schema. Commit FIRST as a single isolated commit: `feat(F2/mcp): add mcp message schemas`. Push. Then continue.

STEP 3 — Migrate webview to Preact:
- Replace src/features/mcp/webview/views/*.ts → *.tsx (Preact functional components)
- Replace src/features/mcp/webview/components/*.ts → *.tsx
- src/features/mcp/webview/index.tsx — REPLACE F1 stub. Export default Preact component as feature tab content.
- Use signals (signals.ts) for feature state instead of vanilla state.ts pattern.
- All postMessage sends go via useApi() hook (validates against WebviewMessage union).
- All inbound messages handled via webview/signals/messageBus.ts registration in index.tsx.

STEP 4 — Component patterns:
- No inline styles in TSX. Use className + CSS classes in src/styles/mcp.css.
- No innerHTML / dangerouslySetInnerHTML.
- Lists with >50 items must use <VirtualList /> from src/webview/components/.
- Use clsx for conditional classNames.
- Components must be testable — keep them small.

STEP 5 — Host-side update:
- src/features/mcp/messageHandlers.ts (new) — extract dispatch logic from viewProvider.
- src/features/mcp/viewProvider.ts — slim. Use parseMessage on incoming. Dispatch to messageHandlers.
- All inbound messages from webview MUST be validated via valibot schema (parseMessage). Log + reject on parse error.

STEP 6 — Tests (target ≥ 80% line coverage):
- View components: __tests__/{view}.test.tsx with @testing-library/preact (render, fireEvent, assert DOM).
- Components: __tests__/{component}.test.tsx for each leaf.
- Parser/state: __tests__/{parser}.test.ts pure unit tests.
- messageHandlers: __tests__/messageHandlers.test.ts with mock context.
- Use happy-dom environment (// @vitest-environment happy-dom).

STEP 7 — CSS:
- src/styles/mcp.css — all feature styles. Use CSS vars from tokens.css. Use VS Code theme vars where possible (var(--vscode-*)).
- No magic numbers — use spacing scale from tokens.

STEP 8 — Cleanup:
- Delete every old vanilla DOM file from src/features/mcp/webview/. Verify via Glob.
- Run npm run check (Biome). Fix all violations.
- Run npm run typecheck. Fix all errors.
- Run npm test. All tests green.
- Run npm run build. Verify chunks/mcp-*.js < 50 KB.

STEP 9 — Registry:
- Append one line to src/extension/registry.ts to register mcp contribution if it provides cross-feature data. Skip if not needed.

STEP 10 — Changelog:
- Append to docs/releases/v2.0.0-WIP.md (create if missing):
  ```
  ## mcp
  - Migrated to Preact with signals
  - Added valibot validation on postMessage
  - {any UX changes}
  ```

STEP 11 — Commits (one per logical chunk):
- feat(F2/mcp): add mcp message schemas (if step 2 needed)
- feat(F2/mcp): preact components for list and detail views
- feat(F2/mcp): wire signals and useApi hook
- refactor(F2/mcp): split messageHandlers from viewProvider
- test(F2/mcp): mcp component + handler tests
- style(F2/mcp): move styles to src/styles/mcp.css
- chore(F2/mcp): delete vanilla webview files

STEP 12 — Push: git push -u origin v2/feat-mcp

EXIT CHECKLIST:
- [ ] All old vanilla webview files deleted (Glob src/features/mcp/webview/**/*.ts returns 0 results, only .tsx)
- [ ] All postMessage validated via valibot on both sides
- [ ] Test coverage ≥ 80% lines
- [ ] No imports from other src/features/ (grep src/features/mcp/ for "from.*features/" — only own feature allowed)
- [ ] Biome + tsc + tests + size all green
- [ ] chunks/mcp-*.js ≤ 50 KB
- [ ] CHANGELOG entry added

If you hit a blocker, commit your progress, write BLOCKER.md at repo root describing what's broken, and exit. The orchestrator will skip merging this branch and surface the blocker.

DO NOT:
- Add new features
- Touch other features' files
- Edit package.json / build configs
- Skip tests "for now"
- Use innerHTML or inline styles
- Bump deps

START NOW. Audit first, plan, then execute steps 1-12 in order.
