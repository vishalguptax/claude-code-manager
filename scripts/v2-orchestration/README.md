# v2 Revamp Orchestrator

Headless multi-session Claude Code runner for the Claude Manager v2 Preact revamp.

## What this does

Runs the v2 revamp end-to-end across multiple parallel headless `claude -p` sessions in isolated git worktrees, merging everything into `v2/integration-target`. **Never touches `main`.**

```
main (untouched)
  └─ v2/integration-target  ← all work lands here
       ├─ v2/foundation          F1, sequential
       ├─ v2/host-decompose      F2, parallel
       ├─ v2/feat-account        F2, parallel
       ├─ v2/feat-hooks          F2, parallel
       ├─ v2/feat-mcp            F2, parallel
       ├─ v2/feat-commands       F2, parallel
       ├─ v2/feat-skills         F2, parallel
       ├─ v2/feat-agents         F2, parallel
       ├─ v2/feat-sessions       F2, parallel (critical path)
       ├─ v2/integration         F3, sequential
       └─ v2/release-prep        F4, sequential (manual gate)
```

## Prerequisites

- Windows + PowerShell 5.1 (default)
- `claude` CLI on PATH — verify `claude --version`
- Clean git working tree (`git status` shows nothing)
- On branch `main` with latest pulled
- Disk: ~2 GB free for 11 worktrees
- API budget: roughly $25 per session × 11 = $275 ceiling (real spend usually 30-50% of cap)

## Quick start

```powershell
# From repo root
.\scripts\v2-orchestration\orchestrate.ps1

# That runs F1 → F2 (parallel) → F3. F4 release prep is manual.
```

## Flags

| Flag | Default | Effect |
|---|---|---|
| `-Phase All` | `All` | `All`, `F1`, `F2`, `F3`, or `F4` |
| `-DryRun` | off | Print plan, no execution |
| `-Resume` | off | Skip phases/branches already merged |
| `-SkipBig` | off | Skip the sessions feature (escape hatch) |
| `-Model` | `claude-opus-4-7` | Override model |
| `-BudgetPerSessionUsd` | 25 | Per-session API spend cap |
| `-F2ConcurrencyLimit` | 8 | Max parallel F2 sessions |

## Wall time expectations

| Phase | Sessions | Wall time |
|---|---|---|
| F1 | 1 | 1.5–3h |
| F2 | 8 parallel | 3–8h (sessions feature is critical path) |
| F3 | 1 | 1–2h |
| F4 | 1 | 30–60 min |

**Realistic total: 2–5 days** across multiple invocations. Not 4-5 hours.

The script uses PowerShell jobs that survive the launching shell exiting — you can leave them running and monitor via logs.

## Monitoring

```powershell
# Tail all session logs
Get-Content scripts\v2-orchestration\logs\*.log -Wait -Tail 20

# Watch job status
Get-Job

# Check git progress
git log v2/integration-target --oneline -20
```

## Resume after interruption

```powershell
# Resume skips branches that exist + have been merged
.\scripts\v2-orchestration\orchestrate.ps1 -Resume

# Or run just the missing phase
.\scripts\v2-orchestration\orchestrate.ps1 -Phase F2 -Resume
```

## When a session fails

The orchestrator:
1. Logs the failure
2. Skips merging that branch
3. Continues with other branches
4. Reports failures at end

To retry a failed session:

```powershell
# Inspect log
Get-Content scripts\v2-orchestration\logs\F2-skills.log

# Optionally inspect/edit the worktree
Set-Location ..\claude-manager-skills

# Re-run only that feature by restarting the relevant Claude session manually:
claude -p (Get-Content ..\claude-manager\scripts\v2-orchestration\prompts\07-skills.md -Raw) `
  --permission-mode bypassPermissions `
  --model claude-opus-4-7 `
  --max-budget-usd 25

# Then re-run orchestrator with -Resume to pick up the merge
.\orchestrate.ps1 -Phase F2 -Resume
```

## Handling merge conflicts

If two branches conflict on a shared file:

```powershell
# Orchestrator reports merge failure in final report
# Manually resolve:
git checkout v2/integration-target
git merge v2/feat-{conflicted}
# Resolve conflicts in editor
git add .
git commit
```

Or use the script's failure list to retry merges after resolving:

```powershell
git checkout v2/integration-target
foreach ($branch in @("v2/feat-X", "v2/feat-Y")) {
  git merge --no-ff $branch
}
```

## Safety guarantees

- **Main repo's current branch is never changed.** Script does all merges inside a dedicated `../claude-manager-integration-target` worktree. Your repo at `claude-manager/` stays on whatever branch you had it on.
- **`main` is never checked out for write.** Script reads main commit once to create `v2/integration-target`, then never touches main again.
- **No remote push to main.** Script pushes feature branches only.
- **No publish to marketplace.** F4 prepares a `.vsix` locally; Vishal publishes manually.
- **No telemetry.** Sessions run with no network calls beyond claude.ai API.
- **Permission mode `bypassPermissions`.** Required for unattended execution. Each session is sandboxed to its worktree. Review `prompts/` files to verify each session's allowlist.

## Aborting

```powershell
# Stop all running jobs
Get-Job | Stop-Job
Get-Job | Remove-Job

# Worktrees remain — can be inspected
git worktree list

# Branches remain — can be inspected or deleted
git branch -D v2/foundation v2/feat-account  # etc

# Worktrees cleanup
git worktree remove ..\claude-manager-foundation
# ... or
git worktree prune
```

## File map

```
scripts/v2-orchestration/
├── orchestrate.ps1          # main runner
├── README.md                # this file
├── prompts/                 # per-session prompts (headless claude reads these)
│   ├── _template-feature.md # template for feature migrations (do not run)
│   ├── 01-foundation.md     # F1
│   ├── 02-host-decompose.md # F2 (host)
│   ├── 03-account.md        # F2
│   ├── 04-hooks.md          # F2
│   ├── 05-mcp.md            # F2
│   ├── 06-commands.md       # F2
│   ├── 07-skills.md         # F2
│   ├── 08-agents.md         # F2
│   ├── 09-sessions.md       # F2 (critical path)
│   ├── 10-integration.md    # F3
│   └── 11-release.md        # F4
└── logs/                    # per-session output (created at runtime)
```

## After it finishes

```powershell
# Verify
git log v2/integration-target --oneline
git diff main..v2/integration-target --stat

# Build + test locally
git checkout v2/integration-target
npm install
npm run build
npm test

# Install .vsix locally
code --install-extension dist\claude-manager-2.0.0.vsix --force

# Manual smoke per VERIFY.md, then open PR
gh pr create --base main --head v2/integration-target `
  --title "release: v2.0.0 — Preact revamp" `
  --body-file CHANGELOG.md
```

## Reference docs

- [`docs/planning/v2-revamp-plan.md`](../../docs/planning/v2-revamp-plan.md) — architecture contract
- [`docs/planning/v2-session-prompts.md`](../../docs/planning/v2-session-prompts.md) — original per-session prompts (these orchestrator prompts are headless-adapted versions)
- [`docs/planning/production-readiness.md`](../../docs/planning/production-readiness.md) — gap analysis that motivated the revamp
