# Prompt: self-computed usage stats from raw JSONL

## Goal

Replace `stats-cache.json`-backed usage stats with numbers computed directly from every session transcript under `~/.claude/projects/<slug>/*.jsonl`. The current `AccountData.usage` is read verbatim from Claude CLI's pre-aggregated cache; users notice it doesn't match `/stats` output, and Claude CLI's formula isn't documented or stable. Self-computing gives us ground-truth, transparent numbers that don't drift when Claude updates.

## Context

- **Repo root:** VS Code extension `claude-manager` at the cwd. Read `CLAUDE.md` for architecture.
- **Current parser:** `src/features/account/parser.ts` → `parseUsage()`. It reads `~/.claude/stats-cache.json` and returns `UsageStats`.
- **Types:** `src/features/account/types.ts` — `UsageStats`, `DailyActivity`, `DailyTokens`, `ModelStats`. Preserve shape.
- **View consumer:** `src/features/account/webview/view.ts` — `renderUsageSection`, `renderHeatmap`.
- **Session parser (reference):** `src/features/sessions/parser.ts` — already walks transcript JSONL files; study its file discovery and entry schema handling before writing anything new.
- **Fixture shape:** each `*.jsonl` line is a `SessionEntry` as defined in `src/features/sessions/types.ts`. Assistant messages carry `usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }` and `model: "claude-..."`. User messages have no usage block.
- **Tests:** Vitest, fixtures in `src/features/account/__tests__/`. Any file in `src/` must have tests.

## Requirements

### 1. Replace `parseUsage()` with a walker over transcripts

Keep the function signature and return shape (`UsageStats`). New implementation:

1. Enumerate every `.jsonl` under `~/.claude/projects/` recursively.
2. Skip files with `history.jsonl` name and any files matching `ide-*.jsonl` (non-session artifacts).
3. For each file:
   - Read line-by-line (don't slurp huge files into memory).
   - Parse each line as `SessionEntry`. Drop malformed lines silently (count but don't fail).
   - Accumulate: input + output + cache-read + cache-creation tokens per date (UTC date of `timestamp`) and per model.
   - First user-message timestamp = session start; last entry timestamp = session end.
   - Skip file-history-snapshot and sidechain entries (same filters used in `parseSessionDetail`).
4. Aggregate:
   - `daily: DailyActivity[]` — one row per UTC date with `messageCount`, `sessionCount`, `toolCallCount`.
   - `dailyTokens: DailyTokens[]` — one row per UTC date with `total` = input + output + cache-read + cache-creation.
   - `totalInputTokens`, `totalOutputTokens` — lifetime sums. Do NOT include cache tokens in these two; keep them pure input/output.
   - `byModel: ModelStats[]` — per-model totals including cache.
   - `activeDays`, `totalDays`, `mostActiveDay`, `currentStreak`, `longestStreak` — computed UTC-safe from the set of active-day dates.
   - `longestSessionMs` — max of all sessions' (endTime - startTime).
   - `favoriteModel` — model with highest total token sum.
   - `lastComputedDate` — today's UTC date string. Mark clearly as "claude-manager-computed" so existing view text can swap the "from stats-cache" label.

### 2. Cache for performance

Scanning every JSONL on every tab open is too slow on large histories. Cache layer:

- Store per-file results: `{ mtimeMs, size, dailyDeltas, perModelDeltas, minTs, maxTs, userMsgCount, toolUseCount }`.
- Cache key: file absolute path. Invalidate when mtime OR size differs.
- Persist cache to `~/.claude/.claude-manager-usage-cache.json`. Reload on startup. Write atomically (tmp + rename).
- On parse: open each file's cache entry, re-read if mtime/size changed; otherwise reuse deltas. Aggregate final totals by summing all deltas in memory.
- Incremental — rescanning a single newly-appended file is the common case.

### 3. UI disclaimer

Update `renderUsageSection` in `src/features/account/webview/view.ts`:

- Change the footnote from the current stats-cache text to: "Numbers computed from your session transcripts. Claude CLI's `/stats` uses its own aggregation — expect differences."
- Keep the `lastComputedDate` timestamp display but label as "Last scan" not "Cache last refreshed".
- Tooltip on the footnote explains what's counted: input + output + cache tokens, aggregated per UTC day.

### 4. Tests

Add `src/features/account/__tests__/parseUsage.test.ts` with fixtures:

- Empty `~/.claude/projects/` → zeros everywhere.
- Single session, 3 assistant messages with known token counts → exact totals.
- Two sessions on different UTC dates → daily entries, streak = 0 if not consecutive, 2 if yes.
- Sidechain + file-history-snapshot entries → ignored.
- Malformed JSONL line in middle → skipped, rest parsed.
- Cache file present + matching mtime → returns deltas without re-reading.
- Cache file present + stale mtime → re-reads, updates cache.

Mock `os.homedir` and `fs` via the existing `src/__mocks__` pattern. Don't `vi.mock` per-file.

### 5. Scope + conventions

- Every file in `src/` must have tests (see `CLAUDE.md`).
- Follow `src/features/account/parser.ts` style (tight comments explaining the WHY, no speculative abstraction).
- Don't introduce new dependencies.
- No network calls.
- Keep `UsageStats` shape unchanged — consumer code in the webview must not need edits beyond the disclaimer text.
- Preserve the existing `renderHeatmap` semantics (token-driven intensity, fall back to messageCount).
- The old `parseUsage()`'s stats-cache read path goes away — don't leave it behind as dead code.

### 6. Verification

Before calling it done:

1. `npm test` — all green (existing + new).
2. `npm run build` — both extension + webview bundles.
3. Manual: reload VS Code with the extension installed, open Account → Usage. Numbers should populate; 30-day and 7-day filters should update; heatmap should render.
4. Log a before/after snapshot of totals to compare vs `/stats` output — document expected deltas in a comment if they persist.

## Out of scope

- Matching CLI `/stats` formula exactly (different design choice).
- Showing per-message token drilldown (existing detail view already does that).
- Cross-machine sync / remote caching.
- Session-retention cleanup (separate `cleanupPeriodDays` setting already exists).

## Commit

Once tests pass and the UI renders:

```
feat(account): self-compute usage stats from session transcripts

stats-cache.json values don't match Claude's /stats output and the
formula isn't documented. Walk the transcript JSONL files directly
so users see ground-truth totals — input + output + cache tokens
per UTC day, plus activeDays / streaks / longestSession derived
consistently. Cache per-file deltas keyed on mtime + size so
subsequent opens are near-instant.
```

No `release:` commit — user will ship via `/release` skill after review.
