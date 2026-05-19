# v2 Revamp — Per-Session Execution Prompts

Copy-paste these into a fresh Claude Code session. Each is self-contained. **Execution order is enforced by dependencies — do not start a session before its prerequisites are merged.**

Read [v2-revamp-plan.md](./v2-revamp-plan.md) before any session.

---

## Execution timeline

```
F0 spike                  [days 1-3]    blocking
└─ Vishal sign-off
F1 foundation             [days 4-10]   blocking
└─ merge to v2/main
F2 parallel               [days 11-25]  8 sessions concurrent
├─ host-decompose
├─ account
├─ hooks
├─ mcp
├─ commands
├─ skills
├─ agents
└─ sessions (longest, critical path)
F3 integration            [days 26-32]
F4 release                [day 33]
```

---

## Worktree setup (Vishal, run once before F1)

```powershell
# From repo root
git checkout main
git pull
git checkout -b v2/main
git push -u origin v2/main

# Create worktrees for each session (run as needed)
git worktree add ../claude-manager-spike       v2/spike
git worktree add ../claude-manager-foundation  v2/foundation
git worktree add ../claude-manager-host        v2/host-decompose
git worktree add ../claude-manager-account     v2/feat-account
git worktree add ../claude-manager-hooks       v2/feat-hooks
git worktree add ../claude-manager-mcp         v2/feat-mcp
git worktree add ../claude-manager-commands    v2/feat-commands
git worktree add ../claude-manager-skills      v2/feat-skills
git worktree add ../claude-manager-agents      v2/feat-agents
git worktree add ../claude-manager-sessions    v2/feat-sessions
git worktree add ../claude-manager-integration v2/integration

# Verify
git worktree list
```

**To open a Claude session in a specific worktree:** launch Claude Code with that worktree as the working directory. Each session is isolated — no file lock conflicts.

---

## Session F0 — Preact + CSP spike

**Prerequisites:** none
**Worktree:** `../claude-manager-spike`
**Branch:** `v2/spike` (throwaway)
**Estimated:** 1–3 days

### Prompt

```
You are executing phase F0 (Preact + CSP spike) of the Claude Manager v2 revamp.

REQUIRED READING (do this first):
- docs/planning/v2-revamp-plan.md — entire doc
- src/extension/html.ts — current CSP setup
- src/webview/main.ts — current entry point
- package.json — current deps and build scripts

GOAL: validate that Preact + JSX + signals + esbuild + VS Code CSP all work together. Throwaway code. Single commit. No production quality required.

TASKS:
1. On branch v2/spike, add deps:
   npm install preact @preact/signals valibot
2. Configure tsconfig.json for JSX (jsx: react-jsx, jsxImportSource: preact). Do NOT commit if it breaks existing build.
3. Create src/webview/spike.tsx — minimal Preact component using a signal that counts on button click.
4. Build with esbuild: ESM, target chrome120, JSX automatic, minify.
5. Modify src/extension/html.ts (revert later) to load the spike bundle with proper nonce. Keep default-src 'none', script-src nonce-only, style-src cspSource + unsafe-inline.
6. Run extension via VS Code F5 launch. Open the sidebar webview. Click the button. Confirm signal updates DOM.
7. Send one valibot-validated postMessage from webview to host and back. Log on both sides.
8. Measure bundle size: ls dist/webview/spike.js. Note gzip size.

EXIT CRITERIA (report back to user):
- [ ] Preact mounts in webview with CSP intact (no console errors about CSP violations)
- [ ] Signal updates trigger re-render
- [ ] valibot parse works on both sides
- [ ] Bundle size of spike.js < 12 KB gzipped
- [ ] Screenshot or description of the working spike

If anything fails, STOP and report the blocker. Do not attempt workarounds.

CONSTRAINTS:
- Do NOT touch any feature folder.
- Do NOT delete current main.ts or break the v1 build on this branch.
- This is throwaway. Single commit at the end. No PR.
```

**Exit gate before F1 starts:** Vishal eyeballs the spike, signs off. Worktree + branch deleted.

---

## Session F1 — Foundation

**Prerequisites:** F0 sign-off
**Worktree:** `../claude-manager-foundation`
**Branch:** `v2/foundation` → PR to `v2/main`
**Estimated:** 5–7 days

### Prompt

```
You are executing phase F1 (Foundation) of the Claude Manager v2 revamp. This is the LONGEST and most critical session. All F2 sessions are blocked until you merge to v2/main.

REQUIRED READING:
- docs/planning/v2-revamp-plan.md — entire doc, especially §1 (architecture) and §4 (your tasks)
- docs/planning/production-readiness.md — context on what gaps F1 addresses
- src/extension/html.ts, src/extension/extension.ts
- src/webview/main.ts and entire src/webview/ tree
- src/features/sessions/viewProvider.ts (skim — DO NOT modify)
- All current postMessage types — grep "postMessage" across src/

YOUR BRANCH: v2/foundation (off v2/main)
YOUR FILE ALLOWLIST: per §4.1 of the plan. Roughly everything in:
- package.json, tsconfig.json, biome.json, .nvmrc
- scripts/build-*.mjs
- src/extension/html.ts (modify)
- src/extension/registry.ts (new)
- src/extension/terminal.ts (security fix)
- src/features/sessions/commands.ts (single-line security fix at line 370 only)
- src/core/lru.ts (new)
- src/shared/protocol/** (all new)
- src/shared/types/** (all new)
- src/webview/** (replace entirely)
- src/styles/tokens.css, base.css, components.css, tabs.css
- 7 empty per-feature CSS files
- .github/workflows/ci.yml
- .github/dependabot.yml

DENYLIST:
- ANY src/features/{F}/parser.ts, state.ts, viewProvider.ts, webview/
- src/features/{F}/webview/** (F2 sessions own these)
- src/core/*.ts except lru.ts (only modify if absolutely required for boundary fix — flag in PR)

TASKS: follow §4.1 of the plan, all 17 items, in order. Do not skip. Do not add scope.

EXIT GATE: §4.2 checklist must all be green before opening PR. Run:
- npm run build → succeeds
- npm test → green
- npm run check (Biome) → clean
- npm run size → within budget
- Manual: launch extension, click each tab, confirm "Not migrated yet" placeholder shown

Open PR: v2/foundation → v2/main. Title: "feat(F1): foundation for v2 revamp". Body: link to §4 and exit-gate checklist with all boxes checked.

DO NOT:
- Add new dependencies beyond the §1.1 list
- Modify any feature folder
- Bump VS Code minimum past 1.90.0 without flagging
- Skip tests "for now"
- Inline styles in any TSX file
```

---

## Session F2 host-decompose

**Prerequisites:** F1 merged to v2/main
**Worktree:** `../claude-manager-host`
**Branch:** `v2/host-decompose` → PR to `v2/main`
**Estimated:** 5 days
**Must merge BEFORE F2 feat-sessions starts.**

### Prompt

```
You are executing phase F2 host-decompose of the Claude Manager v2 revamp.

GOAL: Split sessions/viewProvider.ts (2473 lines) and sessions/parser.ts (1503 lines) into focused modules. NO behavior change. Pure refactor.

REQUIRED READING:
- docs/planning/v2-revamp-plan.md §5.4
- src/features/sessions/viewProvider.ts (whole file)
- src/features/sessions/parser.ts (whole file)
- src/features/sessions/searchIndex.ts

PREREQUISITE: confirm F1 merged. Run: git log v2/main --oneline | head -20 and verify F1 commit present.

YOUR BRANCH: v2/host-decompose (off v2/main)

FILE ALLOWLIST (host-side only — do NOT touch webview):
- src/features/sessions/viewProvider.ts (slim down)
- src/features/sessions/parser.ts (turn into facade)
- src/features/sessions/messageHandlers.ts (new)
- src/features/sessions/liveState.ts (new)
- src/features/sessions/watchers.ts (new)
- src/features/sessions/metaParser.ts (new)
- src/features/sessions/historyParser.ts (new)
- src/features/sessions/grouping.ts (new)
- src/features/sessions/searchIndex.ts (add LRU)
- src/features/sessions/__tests__/** (update tests for new shape)

DENYLIST:
- src/features/sessions/webview/** (F2-sessions owns these)
- ANY other feature
- src/extension/, src/core/, src/webview/, src/styles/
- src/shared/protocol/** (use what F1 defined; do not append)

TASKS:
1. Extract message dispatch switch from viewProvider.ts → messageHandlers.ts. Each case becomes a typed function.
2. Extract PID polling + heartbeat tracking → liveState.ts.
3. Extract file watcher dispatch → watchers.ts.
4. Slim viewProvider.ts to <300 lines (webview wiring + dispatch only).
5. Split parser.ts:
   - metaParser.ts: head/tail metadata extraction
   - historyParser.ts: history.jsonl reading
   - grouping.ts: groupSessions logic
   - parser.ts becomes public facade re-exporting from the three
6. searchIndex.ts: add LRU eviction (max 2000 entries) using src/core/lru.ts.
7. Update __tests__ to match new module boundaries. All existing tests must pass.
8. Run integration smoke (if available) to confirm sessions tab still works in spike webview.

EXIT GATE:
- [ ] All existing sessions feature tests pass
- [ ] viewProvider.ts < 300 lines
- [ ] parser.ts is a facade (<100 lines)
- [ ] No file in src/features/sessions/ > 600 lines
- [ ] searchIndex LRU verified with a test that adds 2500 entries and confirms size cap
- [ ] Biome clean, tsc clean, size-limit green

PR: title "refactor(F2/sessions-host): decompose viewProvider and parser". Base: v2/main.
```

---

## Session F2 feat-account

**Prerequisites:** F1 merged
**Worktree:** `../claude-manager-account`
**Branch:** `v2/feat-account` → PR to `v2/main`
**Estimated:** 4 days

### Prompt

```
You are executing phase F2 feature migration for the ACCOUNT feature of the Claude Manager v2 revamp.

REQUIRED READING:
- docs/planning/v2-revamp-plan.md §5 (entire phase F2 section)
- docs/planning/v2-revamp-plan.md §5.3 (migration recipe — your step-by-step)
- src/features/account/** (entire feature)
- src/shared/protocol/messages.ts (declared by F1; identify account message types)
- src/webview/App.tsx and tabs/ (so you know how to mount your feature tab)

PREREQUISITE: confirm F1 merged. Pull v2/main into your worktree.

YOUR BRANCH: v2/feat-account (off v2/main)

FILE ALLOWLIST:
- src/features/account/** (ALL files including new ones)
- src/styles/account.css
- src/extension/registry.ts — APPEND-ONLY (one line to register account contributions)
- src/shared/protocol/messages.ts — APPEND-ONLY via SEPARATE PR (see below)
- src/shared/protocol/schemas.ts — APPEND-ONLY via same separate PR
- docs/releases/v2.0.0-WIP.md — APPEND-ONLY (single bullet under "Account" heading)

DENYLIST (ABSOLUTE):
- Any other feature's directory
- src/core/**, src/extension/** (except registry.ts append)
- src/webview/** (shared shell — read-only)
- package.json, tsconfig.json, biome.json, esbuild.*
- .github/**

WORKFLOW:
1. Read existing account feature. List every postMessage type sent/received.
2. If new message types are needed beyond what F1 declared:
   - Open a focused "shared-schema" PR FIRST containing ONLY edits to src/shared/protocol/messages.ts + schemas.ts + tests.
   - Title: "feat(F2/account): add account message schemas".
   - Wait for merge to v2/main.
   - Rebase your feature branch on the updated v2/main.
3. Migrate webview per §5.3 recipe (steps 5-13).
4. Update host messageHandlers to accept valibot-parsed payloads.
5. Delete all old vanilla webview files in src/features/account/webview/.

EXIT GATE (§5.2):
- [ ] All old vanilla webview files deleted
- [ ] New Preact webview files complete
- [ ] All postMessage types validated via valibot on both sides
- [ ] Test coverage ≥ 80% lines on views + components
- [ ] Integration smoke (@vscode/test-electron) for account tab passes
- [ ] chunks/account.js ≤ 50 KB
- [ ] No imports from other features
- [ ] Biome + tsc + tests green
- [ ] CHANGELOG entry appended

PR title: "feat(F2/account): migrate account feature to Preact"
PR base: v2/main
PR body: link to §5.2 exit-gate checklist with all boxes checked, plus screenshots/gifs of account tab working.

DO NOT add features. Migration only. New stuff goes in v2.1+ backlog.
```

---

## Session F2 feat-hooks

**Prerequisites:** F1 merged
**Worktree:** `../claude-manager-hooks`
**Branch:** `v2/feat-hooks`
**Estimated:** 3 days

### Prompt

```
You are executing phase F2 feature migration for the HOOKS feature of the Claude Manager v2 revamp.

[Identical to F2-account prompt above, with these substitutions:]

REQUIRED READING (replace): src/features/hooks/** + src/styles/hooks.css

FILE ALLOWLIST: src/features/hooks/**, src/styles/hooks.css, registry.ts (append), shared/protocol (separate PR), v2.0.0-WIP.md (append)

PR title: "feat(F2/hooks): migrate hooks feature to Preact"
```

---

## Session F2 feat-mcp

**Prerequisites:** F1 merged
**Worktree:** `../claude-manager-mcp`
**Branch:** `v2/feat-mcp`
**Estimated:** 3 days

### Prompt

```
You are executing phase F2 feature migration for the MCP feature of the Claude Manager v2 revamp.

[Identical to F2-account prompt above, with these substitutions:]

REQUIRED READING (replace): src/features/mcp/** + src/styles/mcp.css

FILE ALLOWLIST: src/features/mcp/**, src/styles/mcp.css, registry.ts (append), shared/protocol (separate PR), v2.0.0-WIP.md (append)

PR title: "feat(F2/mcp): migrate mcp feature to Preact"
```

---

## Session F2 feat-commands

**Prerequisites:** F1 merged
**Worktree:** `../claude-manager-commands`
**Branch:** `v2/feat-commands`
**Estimated:** 3 days

### Prompt

```
You are executing phase F2 feature migration for the COMMANDS feature of the Claude Manager v2 revamp.

[Identical to F2-account prompt above, with these substitutions:]

REQUIRED READING (replace): src/features/commands/** + src/styles/commands.css

FILE ALLOWLIST: src/features/commands/**, src/styles/commands.css, registry.ts (append), shared/protocol (separate PR), v2.0.0-WIP.md (append)

PR title: "feat(F2/commands): migrate commands feature to Preact"
```

---

## Session F2 feat-skills

**Prerequisites:** F1 merged
**Worktree:** `../claude-manager-skills`
**Branch:** `v2/feat-skills`
**Estimated:** 4 days

### Prompt

```
You are executing phase F2 feature migration for the SKILLS feature of the Claude Manager v2 revamp.

[Identical to F2-account prompt above, with these substitutions:]

REQUIRED READING (replace): src/features/skills/** + src/styles/skills.css

FILE ALLOWLIST: src/features/skills/**, src/styles/skills.css, registry.ts (append), shared/protocol (separate PR), v2.0.0-WIP.md (append)

PR title: "feat(F2/skills): migrate skills feature to Preact"
```

---

## Session F2 feat-agents

**Prerequisites:** F1 merged
**Worktree:** `../claude-manager-agents`
**Branch:** `v2/feat-agents`
**Estimated:** 4 days

### Prompt

```
You are executing phase F2 feature migration for the AGENTS feature of the Claude Manager v2 revamp.

[Identical to F2-account prompt above, with these substitutions:]

REQUIRED READING (replace): src/features/agents/** + src/styles/agents.css

FILE ALLOWLIST: src/features/agents/**, src/styles/agents.css, registry.ts (append), shared/protocol (separate PR), v2.0.0-WIP.md (append)

PR title: "feat(F2/agents): migrate agents feature to Preact"
```

---

## Session F2 feat-sessions (CRITICAL PATH)

**Prerequisites:** F1 merged AND F2-host-decompose merged
**Worktree:** `../claude-manager-sessions`
**Branch:** `v2/feat-sessions`
**Estimated:** 10 days

### Prompt

```
You are executing phase F2 feature migration for the SESSIONS feature — the largest and most complex feature. This is the CRITICAL PATH of the v2 revamp.

REQUIRED READING:
- docs/planning/v2-revamp-plan.md §5 entire
- src/features/sessions/** — ENTIRE feature
- The host-side has ALREADY been decomposed by F2-host-decompose. Your job is webview only.
- Pay special attention to: src/features/sessions/webview/views/listView.ts, sessionItem.ts, detailView.ts, searchView.ts.

PREREQUISITES (verify both):
1. F1 merged to v2/main: git log v2/main --oneline | grep "feat(F1)"
2. F2-host-decompose merged to v2/main: git log v2/main --oneline | grep "refactor(F2/sessions-host)"

If either is missing, STOP and report.

YOUR BRANCH: v2/feat-sessions (off updated v2/main)

FILE ALLOWLIST:
- src/features/sessions/webview/** (your domain)
- src/features/sessions/types.ts (webview-facing types only — coordinate with host if shared)
- src/features/sessions/messageHandlers.ts (update payload types only — do not change dispatch logic)
- src/styles/sessions.css
- src/extension/registry.ts (append-only)
- src/shared/protocol/messages.ts + schemas.ts (separate PR — sessions has the most message types)
- docs/releases/v2.0.0-WIP.md (append)

DENYLIST:
- src/features/sessions/parser.ts and the new metaParser/historyParser/grouping files (host-decompose owns)
- src/features/sessions/viewProvider.ts, liveState.ts, watchers.ts, searchIndex.ts
- ANY other feature
- src/core/**, src/extension/** (except registry append)
- src/webview/**, package.json, etc.

SPECIAL CONSIDERATIONS:
1. VirtualList — sessions list can have 5000+ items. MUST use webview/components/VirtualList provided by F1. Do not render a flat list.
2. Live status dot — uses signals subscribed to host PID polls. Wire via signals/messageBus.
3. Branch name validation — security fix landed in F1 at src/extension/terminal.ts. Ensure your "Switch & Resume" UI calls the validated function.
4. Detail view — large transcripts must lazy-load. Use the existing host-side parseJsonlFile streaming; render windowed list of messages.
5. Search — debounce input via useDebounce hook. Send query to host; host returns paginated results.
6. Delta postMessage — host sends added/updated/removed instead of full tree (added in F1 protocol). Apply via signal mutations.

WORKFLOW: §5.3 recipe applies. Allocate days roughly:
- Days 1-2: shared-schema PR (sessions has ~25 message types)
- Days 3-4: ListView + VirtualList wiring
- Days 5-6: DetailView with windowed transcript
- Day 7: SearchView
- Day 8: Live status + delta updates
- Day 9: Tests (target 80% lines)
- Day 10: Integration smoke + bug-fix

EXIT GATE (§5.2):
- [ ] All vanilla webview files deleted from src/features/sessions/webview/
- [ ] VirtualList renders 5000-fixture without jank
- [ ] Delta postMessages applied correctly (snapshot test)
- [ ] DetailView lazy-loads ≤200 messages at a time
- [ ] Integration smoke: open sidebar, search, click session, resume → all work
- [ ] chunks/sessions.js ≤ 50 KB (this is the biggest feature — may need split further)
- [ ] Test coverage ≥ 80%
- [ ] Biome + tsc + tests + size green

PR title: "feat(F2/sessions): migrate sessions feature to Preact with VirtualList"

If chunks/sessions.js > 50 KB after honest minification, propose a sub-split (e.g., DetailView as a separate dynamically-imported chunk) in the PR description. Don't silently bust the budget.
```

---

## Session F3 — Integration

**Prerequisites:** ALL F2 PRs merged to v2/main
**Worktree:** `../claude-manager-integration`
**Branch:** `v2/integration`
**Estimated:** 5 days

### Prompt

```
You are executing phase F3 (Integration) of the Claude Manager v2 revamp.

REQUIRED READING:
- docs/planning/v2-revamp-plan.md §6 entire
- All 7 F2 PRs merged commit messages (git log v2/main --oneline)
- docs/releases/v2.0.0-WIP.md (assembled by F2 sessions)

PREREQUISITE: verify all F2 branches merged and deleted on remote.
git branch -r | grep v2/feat- — must return empty.

YOUR BRANCH: v2/integration (off v2/main)

FILE ALLOWLIST: any file in the repo. This is the integration session. But:
- Prefer ADDITIONS over MODIFICATIONS
- If you modify a file outside the integration scope (workflows, README, CHANGELOG, e2e tests, scripts), document why in the PR

TASKS: follow §6.1 of the plan, all 11 items.

CRITICAL:
1. Performance harness FIRST. Build a fixture of 5000 sessions in a temp dir. Measure cold activation, sidebar open, search latency, 24h memory soak (run shortened — 1h with extrapolation).
2. Compare against v1.10 baseline. If any metric regresses >10%, STOP and report — the feature sessions may need patches.
3. Integration tests on Windows AND macOS AND Linux (use CI matrix; you cannot test all three locally).
4. Beta release as v2.0.0-beta.1. Push tag, let release workflow build, distribute to a small group.
5. Collect feedback for 7 days minimum before final release.

EXIT GATE: §6.2 must all be green.

PR title: "feat(F3): integrate v2 — beta candidate"
```

---

## Session F4 — Release

**Prerequisites:** F3 merged + 7-day beta soak + no critical issues
**Worktree:** `../claude-manager-integration` (reuse)
**Branch:** `v2/main` → PR to `main`
**Estimated:** 1 day

### Prompt

```
You are executing phase F4 (Release) of the Claude Manager v2 revamp.

PREREQUISITE: beta has been soaked for ≥7 days with no critical issues reported.

TASKS:
1. Open PR: v2/main → main. Title: "release: v2.0.0 — Preact revamp". Body: full changelog from docs/releases/v2.0.0-WIP.md, finalized.
2. Squash-merge (preserves clean main history; v2/main retains phase commits for archaeology).
3. Tag v2.0.0, push tag.
4. Wait for release workflow to publish to VS Code Marketplace + Open VSX.
5. Verify install on a fresh VS Code: `code --install-extension vishalguptax.claude-manager`. Open sidebar. Confirm all 7 tabs work.
6. Post announcement in GitHub Discussions referencing the changelog and key architectural changes.
7. Open issue in repo titled "v2.0.0 release — 72h monitoring" for any user-reported regressions.
8. Cleanup: git worktree prune; delete v2/feat-* branches on remote; delete worktrees locally.

ROLLBACK PLAN (if marketplace install breaks):
- Mark v2.0.0 as a pre-release in Marketplace
- Cut v2.0.1 hotfix from v2/main or revert
- Bump v1.10.x as a maintenance line if a flag-day rollback is needed

DO NOT delete v1-maintenance branch — keep for 3 months minimum for hotfixes.
```

---

## Coordination notes

### Shared-schema PRs

When an F2 session needs to add postMessage types:

1. Pause feature branch work
2. Create branch `v2/schemas-{feature}` off `v2/main`
3. Edit ONLY `src/shared/protocol/messages.ts`, `src/shared/protocol/schemas.ts`, their tests
4. PR title: `feat(F2/{feature}): add {feature} message schemas`
5. PR base: `v2/main`. Get merged.
6. Rebase feature branch on updated `v2/main`. Continue.

This avoids 8 long-lived branches each touching the same protocol file.

### Daily sync (recommended)

Vishal runs `git fetch && git log v2/main --oneline --since="1 day ago"` daily. If any F2 session has merged, every other live session should rebase before next commit.

### When a session hits a blocker

1. Session reports the blocker in PR description (draft PR) or commit message.
2. Vishal triages — is this an architecture issue? Plan update needed?
3. If architecture: update `docs/planning/v2-revamp-plan.md` first, then unblock.
4. If implementation: pair with another session or escalate priority.

### Forbidden cross-session communication

Sessions DO NOT directly talk. All coordination is via:
- This document (plan)
- Git (branches, PRs)
- Vishal as human router

This keeps sessions independent + parallelizable + auditable.

---

## Quickstart for Vishal

```
Day 1:    Run worktree setup commands above
Day 1-3:  Launch F0 spike session, review result
Day 4:    Launch F1 foundation session
Day 11:   F1 merged. Launch F2-host-decompose + F2-account + F2-hooks in parallel (3 sessions)
Day 12:   Add F2-mcp + F2-commands (now 5 parallel)
Day 16:   F2-host-decompose merges. Launch F2-sessions + F2-skills + F2-agents (now ~6 parallel)
Day 25:   All F2 merged
Day 26:   Launch F3 integration
Day 32:   v2.0.0-beta.1 released
Day 39:   Beta soak done. Launch F4 release
Day 40:   v2.0.0 live
```

You manage 1–6 parallel Claude sessions at a time. Each operates independently. Conflicts impossible if file allowlists respected.
