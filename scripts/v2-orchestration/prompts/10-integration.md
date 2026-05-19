You are executing phase F3 (Integration) of the Claude Manager v2 revamp.

REQUIRED READING:
1. docs/planning/v2-revamp-plan.md §6 (entire phase F3 section)
2. docs/releases/v2.0.0-WIP.md (assembled by F2 sessions — should have per-feature entries)
3. Run: git log v2/integration-target --oneline (read recent commits to understand what F2 delivered)

YOUR BRANCH: v2/integration (off v2/integration-target)

PREREQUISITE: ALL F2 PRs merged into v2/integration-target.
Verify: git log v2/integration-target --oneline | Select-String "feat\(F2/" must show ≥7 distinct features.

FILE ALLOWLIST: any file in repo (this is the integration phase). But:
- Prefer ADDITIONS over modifications
- If you modify shared-protocol or webview shell, justify in commit message
- DO NOT modify package.json runtime deps (only dev deps for test harness if needed)

TASKS:

1. Smoke audit — verify all features work end-to-end:
   - npm install
   - npm run build (must succeed)
   - npm run typecheck (must pass)
   - npm run check (must pass)
   - npm test (must pass)
   - npm run size (must pass)
   If any fails: investigate, fix the underlying issue (do NOT bypass).

2. Integration tests via @vscode/test-electron:
   - Create test/integration/extension.test.ts
   - Boot VS Code with extension installed
   - Open sidebar
   - For each feature tab (account, sessions, skills, commands, hooks, mcp, agents):
     - Click tab
     - Wait for ready signal
     - Assert no console errors
     - Assert expected DOM elements present
   - Add npm script: "test:integration": "node ./out/test/runTest.js"
   - Wire into CI

3. Performance harness:
   - Create scripts/perf/generate-fixtures.mjs
     - Generates fake ~/.claude/projects/{N}/{sessionId}.jsonl files
     - Configurable count via CLI: --count 5000
   - Create scripts/perf/measure.mjs
     - Boots extension with fixture pointing to fake home
     - Measures: activation time, sidebar first-paint, search latency, postMessage payload size, memory after 5min idle
     - Outputs JSON report
   - Baseline against v1.10.0: if any metric regresses >10%, log warning + continue (do not block — surface for review)

4. Cross-feature integration tests:
   - Resume a session, verify terminal opens
   - Edit a hook, verify file changed on disk
   - Add an MCP server, verify settings.json updated
   - Invoke an agent, verify orchestration

5. Decompose any remaining files >400 LOC if encountered (not exhaustive — pragmatic).

6. CodeQL workflow: .github/workflows/codeql.yml from official template (javascript + typescript).

7. PR + issue templates:
   - .github/PULL_REQUEST_TEMPLATE.md
   - .github/ISSUE_TEMPLATE/bug.yml, feature_request.yml, config.yml

8. README rewrite:
   - Reflect v2 architecture (Preact webview, valibot, signals)
   - Keep "100% local, zero telemetry" promise prominent (with footnote about opt-in quota fetch)
   - Update screenshots if structure changed (note: do not generate fake screenshots — leave as TODO if originals are stale)
   - Update commands table, settings table

9. CHANGELOG.md:
   - Assemble from docs/releases/v2.0.0-WIP.md per-feature entries
   - Group: Added, Changed, Removed, Security
   - Date: today
   - Mark as v2.0.0
   - Move v2.0.0-WIP.md content into docs/releases/v2.0.0.md
   - Delete v2.0.0-WIP.md

10. Migration guide docs/migration/v1-to-v2.md:
    - User-visible changes (should be ~zero)
    - Settings keys preserved (verify)
    - Command IDs preserved (verify)
    - View IDs preserved (verify)
    - Rollback instructions

11. Beta flag:
    - Bump version in package.json to 2.0.0-beta.1
    - Mark as preview in package.json: "preview": true

12. Final commits:
    - feat(F3): integration tests with @vscode/test-electron
    - feat(F3): performance harness with 5k-session fixture
    - feat(F3): CodeQL workflow + PR/issue templates
    - docs(F3): rewrite README for v2 architecture
    - docs(F3): v2.0.0 changelog and v1-to-v2 migration guide
    - chore(F3): bump to 2.0.0-beta.1

13. Push: git push -u origin v2/integration

EXIT CHECKLIST:
- [ ] All builds + tests + lint + typecheck green
- [ ] Integration smoke covers all 7 features
- [ ] Perf baseline measured; regressions logged
- [ ] Bundle sizes within budget
- [ ] CodeQL workflow added
- [ ] README + CHANGELOG + migration guide written
- [ ] Version bumped to 2.0.0-beta.1

If a feature integration test fails because that F2 session left a bug, write the failing test (so it's documented), commit, then write BLOCKER.md listing which feature needs a follow-up F2 retry. Do not silently skip.

START NOW.
