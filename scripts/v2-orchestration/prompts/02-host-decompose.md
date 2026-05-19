You are executing phase F2 host-decompose. Refactor only — NO behavior change.

REQUIRED READING:
- docs/planning/v2-revamp-plan.md §5.4
- src/features/sessions/viewProvider.ts (2473 lines — entire file)
- src/features/sessions/parser.ts (1503 lines — entire file)
- src/features/sessions/searchIndex.ts
- src/core/lru.ts (created by F1)

PREREQUISITE: confirm F1 merged. Run:
  git log v2/integration-target --oneline | Select-String "feat\(F1\)"
If empty, STOP and exit with error.

YOUR BRANCH: v2/host-decompose (off v2/integration-target)

FILE ALLOWLIST (host-side only, NO webview):
- src/features/sessions/viewProvider.ts (slim to <300 lines)
- src/features/sessions/parser.ts (turn into facade <100 lines)
- src/features/sessions/messageHandlers.ts (new)
- src/features/sessions/liveState.ts (new — PID polling, heartbeat)
- src/features/sessions/watchers.ts (new — file watcher dispatch)
- src/features/sessions/metaParser.ts (new — head/tail metadata extraction)
- src/features/sessions/historyParser.ts (new — history.jsonl reading)
- src/features/sessions/grouping.ts (new — groupSessions)
- src/features/sessions/searchIndex.ts (modify — add LRU eviction max 2000)
- src/features/sessions/__tests__/** (update for new shape)

DENYLIST:
- src/features/sessions/webview/** (F2-sessions owns)
- ANY other feature folder
- src/extension/, src/core/, src/webview/, src/styles/
- src/shared/protocol/** (use what F1 declared, do not append)
- package.json, tsconfig, biome, esbuild configs

TASKS:

1. Extract message dispatch switch from viewProvider.ts (currently ~40 cases starting ~line 980) into messageHandlers.ts. Each case = typed function `handleSessionsList(payload, ctx)`. Export `dispatch(msg, ctx)`. viewProvider calls dispatch.

2. Extract PID polling + heartbeat tracking → liveState.ts. Exports `startLivePoll(intervalMs, onUpdate)`, `stopLivePoll()`.

3. Extract file watcher dispatch → watchers.ts. Exports `createWatchers(ctx)` returning Disposable.

4. Slim viewProvider.ts:
   - Webview HTML setup
   - dispatch wiring (messageHandlers)
   - lifecycle (resolveWebviewView)
   - Push everything else into the new files
   - Target: <300 lines.

5. Split parser.ts:
   - metaParser.ts: head/tail extraction, sessionMetaCache (with LRU from core/lru, max 2000)
   - historyParser.ts: history.jsonl reading, pendingCache + orphanCache (both LRU, max 2000)
   - grouping.ts: groupSessions, sort, filter
   - parser.ts: facade re-exporting; <100 lines.

6. searchIndex.ts: wrap existing `index` Map in LRU<string, IndexEntry>(2000). Promote on access. Add eviction.

7. Update __tests__:
   - Move tests next to extracted files
   - All existing assertions must pass
   - Add LRU eviction test for searchIndex (insert 2500, assert size 2000)

8. Run npm test in repo root via Bash tool. All sessions feature tests must pass.

9. Commit chunks:
   - refactor(F2/sessions-host): extract messageHandlers from viewProvider
   - refactor(F2/sessions-host): extract liveState
   - refactor(F2/sessions-host): extract watchers
   - refactor(F2/sessions-host): split parser into meta/history/grouping
   - feat(F2/sessions-host): LRU eviction on searchIndex
   - refactor(F2/sessions-host): slim viewProvider to wiring

10. Push: git push -u origin v2/host-decompose

EXIT CHECKLIST:
- [ ] viewProvider.ts < 300 lines
- [ ] parser.ts is a facade < 100 lines
- [ ] No file in sessions/ > 600 lines
- [ ] searchIndex LRU verified by test
- [ ] All tests pass
- [ ] No webview file touched

If npm test fails after refactor, fix until green. Refactor with no test = unacceptable.

START NOW.
