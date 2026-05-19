# Manual run guide — v2 revamp

The headless orchestrator (`orchestrate.ps1`) is unreliable on PowerShell 5.1 due to arg parsing + encoding quirks. **Use this manual workflow instead.** It is more reliable, lets you watch each session, and intervene when needed.

## One-time setup

```powershell
cd C:\Users\001ch\OneDrive\Desktop\projects\2026\claude-manager
.\scripts\v2-orchestration\setup-worktrees.ps1
```

Creates 12 worktrees as sibling directories of `claude-manager/`:

```
projects/2026/
├── claude-manager/                       <- your main repo (stays on main)
├── claude-manager-integration-target/    <- merge target
├── claude-manager-foundation/            <- F1
├── claude-manager-host/                  <- F2 host
├── claude-manager-account/               <- F2
├── claude-manager-hooks/                 <- F2
├── claude-manager-mcp/                   <- F2
├── claude-manager-commands/              <- F2
├── claude-manager-skills/                <- F2
├── claude-manager-agents/                <- F2
├── claude-manager-sessions/              <- F2 (critical path)
├── claude-manager-integration/           <- F3
└── claude-manager-release/               <- F4
```

## Phase F1 — Foundation (blocking, sequential)

**1. Open new terminal in F1 worktree:**
```powershell
cd ..\claude-manager-foundation
```

**2. Launch Claude Code interactive:**
```powershell
claude
```

**3. In Claude prompt, paste the prompt file path:**
```
Read C:\Users\001ch\OneDrive\Desktop\projects\2026\claude-manager\scripts\v2-orchestration\prompts\01-foundation.md and execute it.
```

Or open the prompt file in editor, copy its content, paste into Claude.

**4. Watch.** F1 takes ~2-3h. Don't close window.

**5. When Claude finishes (no more activity, returns to prompt):** verify build:
```powershell
npm install
npm run build
npm test
```

**6. If green: merge to integration target.**

Open new terminal:
```powershell
cd ..\claude-manager-integration-target
git pull
git merge --no-ff v2/foundation -m "merge(F1): foundation into v2/integration-target"
git push
```

**7. If broken:** inspect changes, ask Claude to fix in same session, or abort:
```powershell
# Reset F1 worktree (if you want to retry from scratch)
cd ..\claude-manager-foundation
git reset --hard v2/integration-target
# Re-launch claude here
```

## Phase F2 — Parallel (8 sessions concurrent)

Open 8 separate terminal windows. Each in own worktree with own Claude session.

| Window | Worktree | Prompt |
|---|---|---|
| 1 | `..\claude-manager-host` | `02-host-decompose.md` |
| 2 | `..\claude-manager-account` | `03-account.md` |
| 3 | `..\claude-manager-hooks` | `04-hooks.md` |
| 4 | `..\claude-manager-mcp` | `05-mcp.md` |
| 5 | `..\claude-manager-commands` | `06-commands.md` |
| 6 | `..\claude-manager-skills` | `07-skills.md` |
| 7 | `..\claude-manager-agents` | `08-agents.md` |
| 8 | `..\claude-manager-sessions` | `09-sessions.md` |

**Note:** F2-sessions blocks on F2-host-decompose finishing first. Launch host immediately, sessions ~30 min later (host needs to land first commits at minimum).

In each window:
```powershell
cd <worktree-path>
git pull   # ensure latest v2/integration-target merged in
claude
```

Paste prompt content into Claude. Let it run.

## After each F2 session finishes

Merge that branch into integration-target:
```powershell
cd ..\claude-manager-integration-target
git pull
git merge --no-ff v2/feat-<feature> -m "merge(F2/<feature>): into v2/integration-target"
git push
```

**Order matters:** merge host-decompose FIRST, then features in any order. If conflicts:
```powershell
# Resolve conflicts in editor
git add .
git commit
```

## Phase F3 — Integration

After ALL F2 branches merged:
```powershell
cd ..\claude-manager-integration
git pull
claude
```

Paste `prompts\10-integration.md`. Let it run.

Merge:
```powershell
cd ..\claude-manager-integration-target
git pull
git merge --no-ff v2/integration -m "merge(F3): integration into v2/integration-target"
git push
```

## Phase F4 — Release prep (manual gate)

```powershell
cd ..\claude-manager-release
git pull
claude
```

Paste `prompts\11-release.md`. Produces `.vsix` locally. Does NOT publish.

Merge + manually publish:
```powershell
cd ..\claude-manager-integration-target
git pull
git merge --no-ff v2/release-prep -m "merge(F4): release prep"
git push

# Manual publish
code --install-extension dist\claude-manager-2.0.0.vsix --force
# Smoke test, then:
gh pr create --base main --head v2/integration-target --title "release: v2.0.0 - Preact revamp"
# After PR merge:
git tag v2.0.0
git push --tags
# CI publishes to marketplace
```

## Monitoring during F2

```powershell
# In a spare terminal, watch integration target grow
cd ..\claude-manager-integration-target
git log --oneline -20

# Check worktree statuses
cd ..\claude-manager
git worktree list
```

## Abort / cleanup

```powershell
# Remove a single worktree
git worktree remove ..\claude-manager-account
git branch -D v2/feat-account

# Remove all
git worktree list | Select-String "claude-manager-" | ForEach-Object {
  $path = ($_ -split '\s+')[0]
  git worktree remove $path --force
}
git worktree prune
git branch | Select-String "v2/" | ForEach-Object { git branch -D ($_.ToString().Trim()) }
```

## Tips

- **Use separate Windows Terminal tabs** with named profiles for each session. Helps track which is which.
- **Don't close a Claude window** until the session ends naturally. Closing kills the session.
- **If a session goes off the rails:** type a corrective message into Claude, don't restart. It has full context.
- **Budget per session:** rough estimate $5-25 per F2 feature, $20-40 for sessions feature, $30-50 for F1.
- **Sleep your laptop:** Claude API runs server-side; sessions survive sleep. But you won't see progress until you wake.

## Why not the headless script?

The original `orchestrate.ps1`:
- Used `cmd /c` piping → arg quoting fragile
- PowerShell 5.1 default encoding → log files UTF-16, hard to read
- `claude -p` non-interactive mode → no ability to course-correct mid-run
- Long-running blocking jobs → if shell dies, session dies

Manual approach: more reliable, more visible, you can intervene.
