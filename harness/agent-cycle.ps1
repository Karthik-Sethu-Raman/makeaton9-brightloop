# agent-cycle.ps1 — ONE bounded autonomous agent cycle (worker or integrator).
# Run by Task Scheduler (or manually for dry-runs). Self-healing by design:
# a failed cycle loses at most one task; the next scheduled fire starts clean.
#
# v2 (red-team hardened): machine-wide mutex (no two cycles share a repo),
# pre-flight git hygiene (killed-cycle recovery), offline-vs-conflict
# distinction, re-land recovery instead of wedge-prone exit paths,
# mandatory identity guard checked BEFORE and AFTER the agent turn,
# autosave ban-list + conflict-marker guard.
param(
    [Parameter(Mandatory=$true)][string]$RepoPath,
    [Parameter(Mandatory=$true)][string]$Member,
    [ValidateSet('worker','integrator','video','bootstrap')][string]$Mode = 'worker',
    [Parameter(Mandatory=$true)][string]$GitEmail,   # required: commits must map to this account
    [int]$MaxTurns = 20,        # worker default 20 (fits the 19-min cap); integrator uses 40
    [string]$HarnessDir = ''
)

$ErrorActionPreference = 'Continue'
if (-not $HarnessDir) { $HarnessDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$LogFile = Join-Path $env:TEMP "makeaton-cycle-$Member.log"

function Log($msg) {
    $line = "{0} [{1}/{2}] {3}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Member, $Mode, $msg
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}
function Fail($code, $msg) { Log "EXIT $code - $msg"; exit $script:code }

# --- 0. machine-wide mutex: never two cycles in one repo, whatever the schedule ----
$waitMin = if ($Mode -eq 'worker') { 3 } else { 12 }   # FINAL waits long enough to still fit its cap
$mtx = $null
$owned = $false
try {
    $mtx = New-Object System.Threading.Mutex($false, 'Global\MakeATONCycle')
    $owned = $mtx.WaitOne([timespan]::FromMinutes($waitMin))
} catch { $owned = $true }   # mutex problems must not stop the cycle
if (-not $owned) { Log "another cycle holds the repo - deferring to next fire"; exit 0 }

$script:code = 0
try {

if (-not (Test-Path $RepoPath)) { $script:code = 1; Log "EXIT 1 - repo path missing: $RepoPath"; exit 1 }
Set-Location $RepoPath

# --- 1. pre-flight hygiene: recover any state a killed cycle left behind ----------
if ((Test-Path '.git\rebase-merge') -or (Test-Path '.git\rebase-apply')) {
    git rebase --abort; git merge --abort
    Log 'recovered: aborted interrupted rebase/merge'
}
$idxLock = '.git\index.lock'
if (Test-Path $idxLock) {
    if ((Get-Item $idxLock).LastWriteTime -lt (Get-Date).AddMinutes(-5)) {
        Remove-Item $idxLock -Force -ErrorAction SilentlyContinue
        Log 'recovered: removed stale index.lock (>5min old)'
    } else {
        $script:code = 8; Log 'EXIT 8 - index.lock is FRESH: another cycle may be alive'; exit 8
    }
}
# dirty tree from a killed cycle: commit it FIRST so autostash pops can never conflict
$status = git status --porcelain
if ("$status".Trim()) {
    git add -A 2>$null
    git commit -m "wip($Member): recovered uncommitted state from killed cycle" --quiet
    Log 'recovered: committed dirty tree from previous cycle (finish that task first if PARTIAL)'
}

# --- 2. identity guard (round 1): never commit under the wrong GitHub account ------
$cfg = (git config user.email)
if ("$cfg".Trim().ToLower() -ne $GitEmail.ToLower()) {
    $script:code = 2; Fail 2 "git identity is '$cfg' but expected '$GitEmail' - NOT committing (Q&A matches commits to accounts)"
}

# --- 3. resolve claude CLI (Task Scheduler context may lack PATH) ------------------
$claude = $null
try { $claude = (Get-Command claude -ErrorAction Stop).Source } catch {}
if (-not $claude) {
    foreach ($p in @("$env:USERPROFILE\.local\bin\claude.exe",
                     "$env:USERPROFILE\AppData\Roaming\npm\claude.cmd")) {
        if (Test-Path $p) { $claude = $p; break }
    }
}
if (-not $claude) { $script:code = 5; Fail 5 "claude CLI not found" }
Log "using claude at $claude"

# --- helpers ----------------------------------------------------------------------
function Test-Online {
    git ls-remote origin HEAD 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}
# Re-land: recover from any divergence WITHOUT bare pull-rebase (which wedges).
# Soft-reset to origin/main keeps every local change staged, loses nothing,
# touches no pushed history, and structurally cannot conflict.
function Reland([string]$reason) {
    git rebase --abort 2>$null; git merge --abort 2>$null
    git fetch origin --quiet
    if ($LASTEXITCODE -ne 0) { Log "reland($reason): fetch failed - staying local"; return 9 }
    $ahead = (git rev-list --count origin/main..HEAD)
    $dirty = (git status --porcelain)
    if ([int]"$ahead" -gt 0 -or "$dirty".Trim()) {
        git reset --soft origin/main
        git add -A 2>$null
        git commit -m "wip($Member): re-land after $reason" --quiet
        git push --quiet
        if ($LASTEXITCODE -eq 0) { Log "reland($reason): recovered and pushed"; return 0 }
        Log "reland($reason): push still failing - work safe locally"; return 9
    }
    Log "reland($reason): nothing to re-land"; return 0
}

# --- 4. sync ------------------------------------------------------------------------
if (-not (Test-Online)) {
    $script:code = 5; Log 'EXIT 5 - offline (network unreachable): skipping, tree untouched'; exit 5
}
git pull --rebase --autostash --quiet
if ($LASTEXITCODE -ne 0) {
    $rc = Reland 'pull conflict'
    if ($rc -ne 0) { $script:code = 3; Log 'EXIT 3 - could not sync'; exit 3 }
}

# --- 5. run the bounded agent turn ---------------------------------------------------
$turns = if ($Mode -eq 'integrator') { 40 } elseif ($Mode -eq 'video') { 50 } elseif ($Mode -eq 'bootstrap') { 60 } else { $MaxTurns }
$promptFile = Join-Path $HarnessDir "cycle-prompt-$Mode.txt"
if (-not (Test-Path $promptFile)) { $script:code = 6; Fail 6 "missing prompt file $promptFile" }
$prompt = (Get-Content $promptFile -Raw -Encoding UTF8)
$prompt = $prompt.Replace('<MEMBER>', $Member)
$prompt = ("CURRENT TIME: {0} IST. Mode: {1}. Member: {2}.`r`n`r`n" -f (Get-Date -Format 'ddd dd MMM HH:mm'), $Mode, $Member) + $prompt

# UNATTENDED NOTE: --dangerously-skip-permissions is required because nobody can
# answer prompts until 16:45. Bounded by: fresh public repo (git history is the undo),
# GitHub blocks force pushes, identity guard before AND after the turn, --max-turns.
Log "starting claude turn (max-turns $turns)"
$OutputEncoding = New-Object System.Text.UTF8Encoding $false   # PS 5.1 pipes ASCII by default; prompts contain unicode
# --strict-mcp-config: load no MCP servers (30s+ per cycle, and they can hang headless)
$prompt | & $claude -p --dangerously-skip-permissions --max-turns $turns --strict-mcp-config 2>&1 | ForEach-Object { Log "claude: $_" }
$claudeExit = $LASTEXITCODE
Log "claude turn finished (exit $claudeExit)"
if ($claudeExit -ne 0) {
    # phone-visible failure signal, best effort (quota/auth/network - otherwise 'quiet' is indistinguishable from 'working')
    Add-Content -Path 'PROGRESS.md' -Value ("| {0} | {1} | - | CYCLE FAILED | claude exit {2} - see local log |" -f (Get-Date -Format 'HH:mm'), $Member, $claudeExit) -Encoding UTF8
}

# --- 6. identity guard (round 2): the agent ran with skip-permissions ---------------
$cfg2 = (git config user.email)
if ("$cfg2".Trim().ToLower() -ne $GitEmail.ToLower()) {
    git config user.email $GitEmail   # restore, then still push - but flag loudly
    Log "WARNING: agent changed git identity to '$cfg2' - restored to '$GitEmail'. Check your commits at 16:45."
}

# --- 7. safety net: nothing may be left uncommitted - but never commit junk ---------
if ((Test-Path '.git\rebase-merge') -or (Test-Path '.git\rebase-apply')) {
    git rebase --abort; git merge --abort
    Log 'aborted mid-operation left by agent turn'
}
git add -A 2>$null
# ban list: never autosave logs/dbs/build/secrets/coverage
git reset -q -- '*.log' '*.db' '*.sqlite' '*.key' '.env*' 'dist' 'coverage*' '.pytest_cache' 2>$null
# never autosave files >2MB (repo bloat) or conflict markers
$staged = (git diff --cached --name-only) 2>$null
foreach ($f in @("$staged" -split "`n")) {
    $f = "$f".Trim()
    if ($f -and (Test-Path $f -ErrorAction SilentlyContinue)) {
        if ((Get-Item $f -ErrorAction SilentlyContinue).Length -gt 2MB) {
            git reset -q -- $f; Log "autosave: skipped oversized file $f"
        }
    }
}
$markers = (git diff --cached | Select-String -Pattern '^<<<<<<< ' -SimpleMatch:$false)
if ($markers) {
    git reset -q
    Log 'autosave: staged changes contain conflict markers - NOT committing; next cycle recovers'
} elseif ("$((git status --porcelain))".Trim()) {
    $msg = if ($claudeExit -eq 0) { "wip($Member): autosave uncommitted cycle output" } else { "wip($Member): partial output from failed cycle (exit $claudeExit)" }
    git commit -m $msg --quiet
    Log 'autosave: committed uncommitted cycle work'
}

# --- 8. push (re-land on rejection; never force) --------------------------------------
git push --quiet
if ($LASTEXITCODE -ne 0) {
    $rc = Reland 'push rejection'
    if ($rc -ne 0) { $script:code = 4; Log 'EXIT 4 - push failed, work safe locally, next cycle retries'; exit 4 }
}
Log 'cycle complete'

} finally {
    if ($owned -and $mtx) { try { $mtx.ReleaseMutex() } catch {} }
}
exit $script:code
