Clear-Host
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot
Write-Host '========== FLEETBRIDGE PRIVATE GITHUB PUBLISH ==========' -ForegroundColor Cyan
Write-Host 'This script publishes SOURCE CODE ONLY. Never upload backups or databases.'
foreach ($cmd in @('git','gh')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd is not installed. Install Git and GitHub CLI first, then retry."
  }
}
# Require a clean, new source folder; never operate on an existing unrelated repo.
if (Test-Path (Join-Path $repoRoot '.git')) {
  throw 'This source folder already contains .git. Review it manually to avoid unintended pushes.'
}
$forbidden = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File | Where-Object {
  $_.Name -match '(?i)^(Preferences|Secure Preferences|vault\..+)$' -or
  $_.Name -match '(?i)(\.sqlite3?$|\.fbdb$|\.db$|\.pem$|\.key$|\.p12$|\.pfx$|^\.env($|\.))'
})
if ($forbidden.Count -gt 0) {
  $forbidden | Select-Object -ExpandProperty FullName
  throw 'Sensitive file names detected. No push allowed.'
}
$scan = Join-Path $repoRoot 'SECURITY_REVIEW.txt'
if (-not (Test-Path $scan)) { throw 'Security review file missing.' }
Write-Host 'Read SECURITY_REVIEW.txt. Automated checks do not guarantee absence of secrets.' -ForegroundColor Yellow
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'First run: gh auth login. No push occurred.' }
Write-Host 'GitHub authenticated.' -ForegroundColor Green
$confirm = Read-Host 'Type PRIVATE-REPO to create/push a NEW private repository named FleetBridge'
if ($confirm -cne 'PRIVATE-REPO') { Write-Host 'Cancelled: no changes.'; return }
& git init -b main
if ($LASTEXITCODE -ne 0) { throw 'git init failed.' }
& git add .
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
# Verify Git staging list and reject risky file names even if the ignore file failed.
$staged=@(& git diff --cached --name-only)
if ($staged | Where-Object { $_ -match '(?i)(^|/)(backups|FleetBridge_Baselines|node_modules|Chrome|\.vercel)(/|$)|\.sqlite|\.fbdb|\.env|\.pem|\.pfx' }) {
  & git reset
  throw 'Forbidden path in staging. Publishing aborted.'
}
Write-Host "Staged files: $($staged.Count)" -ForegroundColor Cyan
Write-Host 'Private repository required. The name FleetBridge must not already exist.'
$owner = (& gh api user --jq .login).Trim()
if (-not $owner) { throw 'Could not determine GitHub account.' }
$repoName = 'FleetBridge'
& gh api "repos/$owner/$repoName" --jq .private 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { throw "Repository $owner/$repoName already exists. Refusing to overwrite." }
& git -c "user.name=$owner" -c "user.email=$owner@users.noreply.github.com" commit -m 'Import private FleetBridge source and synthetic web preview'
if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
& gh repo create "$owner/$repoName" --private --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { throw 'Publish did not finish. Inspect GitHub before trying again.' }
$privacy=(& gh api "repos/$owner/$repoName" --jq .private).Trim()
if ($privacy -ne 'true') { throw 'Privacy verification failed. Immediately verify repository visibility on GitHub.' }
Write-Host "PRIVATE REPOSITORY VERIFIED: https://github.com/$owner/$repoName" -ForegroundColor Green
Write-Host 'Next: Vercel -> New Project -> Import GitHub repo -> Root Directory = web' -ForegroundColor Cyan
