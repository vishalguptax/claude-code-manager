# Setup all worktrees for v2 revamp. No Claude invocation. Low risk.
# Run once before launching Claude sessions manually.

[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$WorktreeRoot = Resolve-Path (Join-Path $RepoRoot "..")
$IntegrationBranch = "v2/integration-target"

$worktrees = @(
  @{ Branch = "v2/integration-target"; Dir = "claude-manager-integration-target"; Base = "main" }
  @{ Branch = "v2/foundation";         Dir = "claude-manager-foundation";         Base = $IntegrationBranch }
  @{ Branch = "v2/host-decompose";     Dir = "claude-manager-host";               Base = $IntegrationBranch }
  @{ Branch = "v2/feat-account";       Dir = "claude-manager-account";            Base = $IntegrationBranch }
  @{ Branch = "v2/feat-hooks";         Dir = "claude-manager-hooks";              Base = $IntegrationBranch }
  @{ Branch = "v2/feat-mcp";           Dir = "claude-manager-mcp";                Base = $IntegrationBranch }
  @{ Branch = "v2/feat-commands";      Dir = "claude-manager-commands";           Base = $IntegrationBranch }
  @{ Branch = "v2/feat-skills";        Dir = "claude-manager-skills";             Base = $IntegrationBranch }
  @{ Branch = "v2/feat-agents";        Dir = "claude-manager-agents";             Base = $IntegrationBranch }
  @{ Branch = "v2/feat-sessions";      Dir = "claude-manager-sessions";           Base = $IntegrationBranch }
  @{ Branch = "v2/integration";        Dir = "claude-manager-integration";        Base = $IntegrationBranch }
  @{ Branch = "v2/release-prep";       Dir = "claude-manager-release";            Base = $IntegrationBranch }
)

Write-Host ""
Write-Host "Setup worktrees for v2 revamp" -ForegroundColor Cyan
Write-Host "Repo root:     $RepoRoot" -ForegroundColor Gray
Write-Host "Worktree root: $WorktreeRoot" -ForegroundColor Gray
Write-Host ""

Set-Location $RepoRoot

# Pre-check
$dirty = git status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
if ($dirty) {
  Write-Host "[X] Tracked file changes present. Commit or stash first:" -ForegroundColor Red
  $dirty | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  exit 1
}

foreach ($w in $worktrees) {
  $path = Join-Path $WorktreeRoot $w.Dir
  $branch = $w.Branch
  $base = $w.Base

  if (Test-Path $path) {
    Write-Host "[skip] worktree exists: $path" -ForegroundColor DarkGray
    continue
  }

  # Branch may already exist
  git show-ref --verify --quiet "refs/heads/$branch"
  $branchExists = ($LASTEXITCODE -eq 0)

  if ($DryRun) {
    if ($branchExists) {
      Write-Host "[DRY] git worktree add $path $branch" -ForegroundColor Yellow
    } else {
      Write-Host "[DRY] git worktree add -b $branch $path $base" -ForegroundColor Yellow
    }
    continue
  }

  if ($branchExists) {
    git worktree add $path $branch | Out-Null
  } else {
    git worktree add -b $branch $path $base | Out-Null
  }

  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] $branch -> $path" -ForegroundColor Green
  } else {
    Write-Host "[X] failed: $branch" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Active worktrees:" -ForegroundColor Cyan
git worktree list

Write-Host ""
Write-Host "Next: open Claude Code in each worktree, paste corresponding prompt file." -ForegroundColor Cyan
Write-Host "See scripts\v2-orchestration\RUN.md for the step-by-step manual workflow." -ForegroundColor Gray
