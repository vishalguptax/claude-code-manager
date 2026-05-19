# v2 Revamp Orchestrator
# Runs F1 foundation then F2 parallel feature migrations in headless Claude sessions.
# Merges all into v2/integration-target. Never touches main.
#
# Usage:
#   .\scripts\v2-orchestration\orchestrate.ps1                # full run (F1 + F2 + F3); F4 manual
#   .\scripts\v2-orchestration\orchestrate.ps1 -Phase F1      # only F1
#   .\scripts\v2-orchestration\orchestrate.ps1 -Phase F2      # only F2 (requires F1 merged)
#   .\scripts\v2-orchestration\orchestrate.ps1 -Phase F3      # only F3 integration (requires F2 done)
#   .\scripts\v2-orchestration\orchestrate.ps1 -Phase F4      # release prep (manual gate before publish)
#   .\scripts\v2-orchestration\orchestrate.ps1 -DryRun        # print plan, no execution
#   .\scripts\v2-orchestration\orchestrate.ps1 -SkipBig       # skip sessions feature (escape hatch)
#   .\scripts\v2-orchestration\orchestrate.ps1 -Resume        # resume; skip branches that exist
#
# Required: claude CLI on PATH, clean git working tree, gh CLI optional.
# Expected wall time: 2-5 days depending on session quality + retries.

[CmdletBinding()]
param(
  [ValidateSet("All", "F1", "F2", "F3", "F4")]
  [string]$Phase = "All",

  [switch]$DryRun,
  [switch]$SkipBig,
  [switch]$Resume,

  [string]$Model = "claude-opus-4-7",
  [int]$BudgetPerSessionUsd = 25,
  [int]$F2ConcurrencyLimit = 8
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$WorktreeRoot = Resolve-Path (Join-Path $RepoRoot "..")
$LogDir = Join-Path $PSScriptRoot "logs"
$PromptDir = Join-Path $PSScriptRoot "prompts"
$IntegrationBranch = "v2/integration-target"
$IntegrationWorktree = Join-Path $WorktreeRoot "claude-manager-integration-target"
$StartCommit = $null

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

# --- Helpers ---

function Write-Stage($msg) { Write-Host ""; Write-Host "=== $msg" -ForegroundColor Cyan }
function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor Gray }
function Write-Ok($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "  [X] $msg" -ForegroundColor Red }

function Invoke-Git {
  param([Parameter(Mandatory)][string[]]$Args, [string]$Cwd = $RepoRoot)
  Push-Location $Cwd
  try {
    & git @Args
    if ($LASTEXITCODE -ne 0) { throw "git $($Args -join ' ') failed in $Cwd" }
  } finally { Pop-Location }
}

function Test-CleanTree {
  Push-Location $RepoRoot
  try {
    # Only block on TRACKED changes (M, A, D, R, C). Untracked (??) is allowed.
    $dirty = git status --porcelain | Where-Object { $_ -notmatch '^\?\?' }
    if ($dirty) { throw "Tracked files have uncommitted changes. Commit or stash first.`n$($dirty -join "`n")" }
    $untracked = git status --porcelain | Where-Object { $_ -match '^\?\?' }
    if ($untracked) {
      Write-Warn "untracked files present (not blocking):"
      $untracked | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }
  } finally { Pop-Location }
}

function Get-CurrentBranch {
  Push-Location $RepoRoot
  try { return (git rev-parse --abbrev-ref HEAD).Trim() }
  finally { Pop-Location }
}

function Test-BranchExists($name) {
  Push-Location $RepoRoot
  try {
    git show-ref --verify --quiet "refs/heads/$name"
    return ($LASTEXITCODE -eq 0)
  } finally { Pop-Location }
}

function New-Worktree {
  param([string]$BranchName, [string]$WorktreePath, [string]$BaseBranch = $IntegrationBranch)

  if (Test-Path $WorktreePath) {
    Write-Info "worktree exists: $WorktreePath"
    return
  }

  if (Test-BranchExists $BranchName) {
    Invoke-Git -Args @("worktree", "add", $WorktreePath, $BranchName)
  } else {
    Invoke-Git -Args @("worktree", "add", "-b", $BranchName, $WorktreePath, $BaseBranch)
  }
  Write-Ok "worktree: $BranchName -> $WorktreePath"
}

# --- Session launcher (headless claude -p) ---

function Start-ClaudeSession {
  param(
    [string]$Name,
    [string]$WorktreePath,
    [string]$PromptPath,
    [string]$BranchName
  )

  $logFile = Join-Path $LogDir "$Name.log"
  $resultFile = Join-Path $LogDir "$Name.result.json"

  if (-not (Test-Path $PromptPath)) { throw "prompt missing: $PromptPath" }
  $prompt = Get-Content $PromptPath -Raw

  Write-Info "launch session: $Name (worktree: $WorktreePath, branch: $BranchName)"
  Write-Info "  log: $logFile"

  if ($DryRun) {
    Write-Warn "DRY RUN - skipping actual launch"
    return $null
  }

  $job = Start-Job -Name $Name -ScriptBlock {
    param($cwd, $prompt, $logFile, $resultFile, $model, $budget)

    Set-Location $cwd
    $env:CLAUDE_NONINTERACTIVE = "1"

    & claude -p $prompt `
      --permission-mode bypassPermissions `
      --output-format json `
      --model $model `
      --max-budget-usd $budget `
      --effort high `
      2>&1 | Tee-Object -FilePath $logFile | Out-Null

    $exit = $LASTEXITCODE
    [pscustomobject]@{ exit = $exit; cwd = $cwd; log = $logFile } |
      ConvertTo-Json | Out-File -FilePath $resultFile -Encoding utf8

    if ($exit -ne 0) { throw "claude exited $exit" }
  } -ArgumentList $WorktreePath, $prompt, $logFile, $resultFile, $Model, $BudgetPerSessionUsd

  return $job
}

# --- Phase 0: Setup ---

function Initialize-Setup {
  Write-Stage "Setup"

  Test-CleanTree
  $current = Get-CurrentBranch
  Write-Info "current branch: $current (will NOT be changed)"

  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    throw "claude CLI not found on PATH"
  }
  Write-Ok "claude CLI available"

  Push-Location $RepoRoot
  try {
    if (-not (Test-BranchExists $IntegrationBranch)) {
      if ($DryRun) {
        Write-Warn "DRY: would create $IntegrationBranch from main"
      } else {
        & git fetch origin main 2>&1 | Out-Null
        & git branch $IntegrationBranch main
        Write-Ok "created $IntegrationBranch from main"
      }
    } else {
      Write-Info "$IntegrationBranch already exists"
    }
    $script:StartCommit = (git rev-parse $IntegrationBranch).Trim()
    Write-Info "integration target commit: $($script:StartCommit.Substring(0,12))"
  } finally { Pop-Location }

  if (-not (Test-Path $IntegrationWorktree)) {
    if ($DryRun) {
      Write-Warn "DRY: would create integration worktree at $IntegrationWorktree"
    } else {
      Invoke-Git -Args @("worktree", "add", $IntegrationWorktree, $IntegrationBranch)
      Write-Ok "integration worktree: $IntegrationWorktree"
    }
  } else {
    Write-Info "integration worktree exists: $IntegrationWorktree"
  }
}

# --- Phase F1: Foundation (sequential, blocks F2) ---

function Invoke-F1 {
  Write-Stage "Phase F1 - Foundation (blocking)"

  $branch = "v2/foundation"
  $worktree = Join-Path $WorktreeRoot "claude-manager-foundation"
  $promptPath = Join-Path $PromptDir "01-foundation.md"

  if ($Resume -and (Test-BranchExists $branch)) {
    Push-Location $RepoRoot
    $mergedInto = git branch --contains $branch | Select-String $IntegrationBranch
    Pop-Location
    if ($mergedInto) {
      Write-Ok "F1 already merged to $IntegrationBranch - skipping"
      return
    }
  }

  New-Worktree -BranchName $branch -WorktreePath $worktree -BaseBranch $IntegrationBranch

  $job = Start-ClaudeSession -Name "F1-foundation" `
    -WorktreePath $worktree -PromptPath $promptPath -BranchName $branch

  if ($DryRun) { return }

  Write-Info "waiting for F1 to complete (blocker; usually 1.5-2h)..."
  Wait-Job $job | Out-Null
  Receive-Job $job -ErrorAction Continue | Out-Null

  if ($job.State -ne "Completed") {
    Write-Err "F1 failed. Check log: $LogDir\F1-foundation.log"
    Remove-Job $job
    throw "F1 foundation session failed"
  }
  Remove-Job $job
  Write-Ok "F1 session completed"

  Push-Location $worktree
  try {
    $ahead = git rev-list --count "$IntegrationBranch..$branch"
    if ([int]$ahead -lt 1) {
      throw "F1 produced no commits. Inspect $LogDir\F1-foundation.log"
    }
    Write-Ok "F1 added $ahead commit(s)"
  } finally { Pop-Location }

  Merge-Branch -SourceBranch $branch -PhaseName "F1"
}

# --- Phase F2: Parallel feature migrations ---

function Get-F2Sessions {
  $sessions = @(
    [pscustomobject]@{ Name = "F2-host-decompose"; Branch = "v2/host-decompose"; Prompt = "02-host-decompose.md"; Worktree = "claude-manager-host" }
    [pscustomobject]@{ Name = "F2-account";        Branch = "v2/feat-account";   Prompt = "03-account.md";        Worktree = "claude-manager-account" }
    [pscustomobject]@{ Name = "F2-hooks";          Branch = "v2/feat-hooks";     Prompt = "04-hooks.md";          Worktree = "claude-manager-hooks" }
    [pscustomobject]@{ Name = "F2-mcp";            Branch = "v2/feat-mcp";       Prompt = "05-mcp.md";            Worktree = "claude-manager-mcp" }
    [pscustomobject]@{ Name = "F2-commands";       Branch = "v2/feat-commands";  Prompt = "06-commands.md";       Worktree = "claude-manager-commands" }
    [pscustomobject]@{ Name = "F2-skills";         Branch = "v2/feat-skills";    Prompt = "07-skills.md";         Worktree = "claude-manager-skills" }
    [pscustomobject]@{ Name = "F2-agents";         Branch = "v2/feat-agents";    Prompt = "08-agents.md";         Worktree = "claude-manager-agents" }
  )

  if (-not $SkipBig) {
    $sessions += [pscustomobject]@{
      Name = "F2-sessions"; Branch = "v2/feat-sessions"; Prompt = "09-sessions.md"; Worktree = "claude-manager-sessions"
    }
  }

  return $sessions
}

function Invoke-F2 {
  Write-Stage "Phase F2 - Parallel feature migrations"

  $sessions = Get-F2Sessions
  Write-Info "launching $($sessions.Count) parallel sessions (concurrency cap: $F2ConcurrencyLimit)"

  $jobs = @()

  foreach ($s in $sessions) {
    if ($Resume -and (Test-BranchExists $s.Branch)) {
      Push-Location $RepoRoot
      $mergedInto = git branch --contains $s.Branch | Select-String $IntegrationBranch
      Pop-Location
      if ($mergedInto) {
        Write-Ok "$($s.Name) already merged - skipping"
        continue
      }
    }

    $worktreePath = Join-Path $WorktreeRoot $s.Worktree
    $promptPath = Join-Path $PromptDir $s.Prompt

    New-Worktree -BranchName $s.Branch -WorktreePath $worktreePath -BaseBranch $IntegrationBranch

    while (($jobs | Where-Object { $_.Job.State -eq "Running" }).Count -ge $F2ConcurrencyLimit) {
      Start-Sleep -Seconds 5
    }

    $job = Start-ClaudeSession -Name $s.Name `
      -WorktreePath $worktreePath -PromptPath $promptPath -BranchName $s.Branch

    if ($null -ne $job) {
      $jobs += [pscustomobject]@{ Job = $job; Session = $s; Worktree = $worktreePath }
    }
  }

  if ($DryRun -or $jobs.Count -eq 0) { return }

  Write-Info "waiting for F2 sessions to complete..."
  Write-Info "  monitor logs with: Get-Content $LogDir\*.log -Wait -Tail 10"

  while ($jobs | Where-Object { $_.Job.State -eq "Running" }) {
    $running = $jobs | Where-Object { $_.Job.State -eq "Running" }
    $done    = $jobs | Where-Object { $_.Job.State -ne "Running" }
    Write-Host "  [$(Get-Date -Format HH:mm:ss)] running: $($running.Count) | done: $($done.Count)" -ForegroundColor DarkGray
    Start-Sleep -Seconds 30
  }

  $failed = @()
  foreach ($entry in $jobs) {
    Receive-Job $entry.Job -ErrorAction Continue | Out-Null
    if ($entry.Job.State -ne "Completed") {
      Write-Err "$($entry.Session.Name) failed (state: $($entry.Job.State))"
      $failed += $entry
    } else {
      Write-Ok "$($entry.Session.Name) completed"
    }
    Remove-Job $entry.Job
  }

  if ($failed.Count -gt 0) {
    Write-Warn "$($failed.Count) F2 session(s) failed. Merge will skip them. Inspect logs in $LogDir."
  }

  Write-Stage "Merging F2 branches into $IntegrationBranch"
  foreach ($entry in $jobs) {
    if ($entry.Job.State -ne "Completed") { continue }

    Push-Location $entry.Worktree
    try {
      $ahead = git rev-list --count "$IntegrationBranch..$($entry.Session.Branch)"
      if ([int]$ahead -lt 1) {
        Write-Warn "$($entry.Session.Name) produced no commits, skipping merge"
        continue
      }
    } finally { Pop-Location }

    Merge-Branch -SourceBranch $entry.Session.Branch -PhaseName $entry.Session.Name
  }
}

# --- Merge logic ---

function Merge-Branch {
  param([string]$SourceBranch, [string]$PhaseName)

  Push-Location $IntegrationWorktree
  try {
    & git pull --ff-only 2>&1 | Out-Null
    & git merge --no-ff $SourceBranch -m "merge($PhaseName): $SourceBranch into $IntegrationBranch" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Err "merge conflict on $SourceBranch"
      Write-Warn "aborting merge; manual resolution required"
      & git merge --abort 2>&1 | Out-Null
      $script:MergeFailures += $SourceBranch
      return
    }
    Write-Ok "merged $SourceBranch into $IntegrationBranch (in worktree)"
  } finally { Pop-Location }
}

# --- Phase F3: Integration ---

function Invoke-F3 {
  Write-Stage "Phase F3 - Integration"

  $branch = "v2/integration"
  $worktree = Join-Path $WorktreeRoot "claude-manager-integration"
  $promptPath = Join-Path $PromptDir "10-integration.md"

  if ($Resume -and (Test-BranchExists $branch)) {
    Push-Location $RepoRoot
    $mergedInto = git branch --contains $branch | Select-String $IntegrationBranch
    Pop-Location
    if ($mergedInto) {
      Write-Ok "F3 already merged - skipping"
      return
    }
  }

  Push-Location $RepoRoot
  try {
    $f2Merged = git log $IntegrationBranch --oneline | Select-String "feat\(F2/" | Measure-Object
    if ($f2Merged.Count -lt 5) {
      Write-Warn "Only $($f2Merged.Count) F2 commits on $IntegrationBranch. F3 may be premature."
      if (-not $DryRun) {
        $confirm = Read-Host "Continue anyway? (y/N)"
        if ($confirm -ne "y") { return }
      }
    }
  } finally { Pop-Location }

  New-Worktree -BranchName $branch -WorktreePath $worktree -BaseBranch $IntegrationBranch

  $job = Start-ClaudeSession -Name "F3-integration" `
    -WorktreePath $worktree -PromptPath $promptPath -BranchName $branch

  if ($DryRun) { return }

  Write-Info "F3 integration session running (perf harness + integration tests + bug fixes)..."
  Wait-Job $job | Out-Null
  Receive-Job $job -ErrorAction Continue | Out-Null

  if ($job.State -ne "Completed") {
    Write-Err "F3 failed. Check log: $LogDir\F3-integration.log"
    Remove-Job $job
    throw "F3 integration failed"
  }
  Remove-Job $job
  Write-Ok "F3 session completed"

  Merge-Branch -SourceBranch $branch -PhaseName "F3"
}

# --- Phase F4: Release prep (MANUAL GATE) ---

function Invoke-F4 {
  Write-Stage "Phase F4 - Release prep"

  Write-Warn "F4 prepares release artifacts but does NOT publish."
  Write-Warn "Publishing to marketplace requires manual confirmation + npm run release."
  Write-Host ""

  $branch = "v2/release-prep"
  $worktree = Join-Path $WorktreeRoot "claude-manager-release"
  $promptPath = Join-Path $PromptDir "11-release.md"

  New-Worktree -BranchName $branch -WorktreePath $worktree -BaseBranch $IntegrationBranch

  $job = Start-ClaudeSession -Name "F4-release-prep" `
    -WorktreePath $worktree -PromptPath $promptPath -BranchName $branch

  if ($DryRun) { return }

  Wait-Job $job | Out-Null
  Receive-Job $job -ErrorAction Continue | Out-Null

  if ($job.State -ne "Completed") {
    Write-Err "F4 prep failed. Check log: $LogDir\F4-release-prep.log"
    Remove-Job $job
    throw "F4 release prep failed"
  }
  Remove-Job $job
  Write-Ok "F4 session completed (artifacts prepared, NOT published)"

  Merge-Branch -SourceBranch $branch -PhaseName "F4"

  Write-Host ""
  Write-Host "  +-- MANUAL STEPS ---------------------------------------+" -ForegroundColor Yellow
  Write-Host "  | 1. Inspect $IntegrationBranch                          |" -ForegroundColor Yellow
  Write-Host "  | 2. Build .vsix locally: npm run release                |" -ForegroundColor Yellow
  Write-Host "  | 3. Install .vsix in fresh VS Code; smoke test          |" -ForegroundColor Yellow
  Write-Host "  | 4. When ready: open PR $IntegrationBranch -> main      |" -ForegroundColor Yellow
  Write-Host "  | 5. After PR merge: tag v2.0.0; CI publishes            |" -ForegroundColor Yellow
  Write-Host "  +--------------------------------------------------------+" -ForegroundColor Yellow
}

# --- Report ---

function Show-FinalReport {
  Write-Stage "Final report"

  Push-Location $RepoRoot
  try {
    $integrationCommits = git rev-list --count "main..$IntegrationBranch"
    Write-Info "commits on $IntegrationBranch ahead of main: $integrationCommits"

    Write-Host ""
    Write-Host "  Live worktrees:" -ForegroundColor Cyan
    git worktree list | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }

    Write-Host ""
    Write-Host "  Logs: $LogDir" -ForegroundColor Cyan

    if ($script:MergeFailures -and $script:MergeFailures.Count -gt 0) {
      Write-Host ""
      Write-Host "  Merge failures (manual resolution needed):" -ForegroundColor Yellow
      $script:MergeFailures | ForEach-Object { Write-Host "    - $_" -ForegroundColor Yellow }
    }

    Write-Host ""
    Write-Host "  Next steps:" -ForegroundColor Cyan
    Write-Host "    1. Inspect $IntegrationBranch" -ForegroundColor Gray
    Write-Host "    2. Resolve merge failures if any" -ForegroundColor Gray
    Write-Host "    3. Run npm install && npm run build && npm test" -ForegroundColor Gray
    Write-Host "    4. Manual QA: launch extension, click each tab" -ForegroundColor Gray
    Write-Host "    5. When ready: open PR $IntegrationBranch -> main" -ForegroundColor Gray
  } finally { Pop-Location }
}

# --- Main ---

$script:MergeFailures = @()

Write-Host ""
Write-Host "+----------------------------------------------------------+" -ForegroundColor Magenta
Write-Host "|         Claude Manager v2 Revamp Orchestrator            |" -ForegroundColor Magenta
Write-Host "+----------------------------------------------------------+" -ForegroundColor Magenta

if ($DryRun) { Write-Warn "DRY RUN mode - no execution" }

Initialize-Setup

if ($Phase -eq "All" -or $Phase -eq "F1") { Invoke-F1 }
if ($Phase -eq "All" -or $Phase -eq "F2") { Invoke-F2 }
if ($Phase -eq "All" -or $Phase -eq "F3") { Invoke-F3 }
if ($Phase -eq "F4")                       { Invoke-F4 }

Show-FinalReport
