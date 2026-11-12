Clear-Host
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Write-Host '========== FLEETBRIDGE PRE-PUBLISH VERIFICATION ==========' -ForegroundColor Cyan
$manifestFile = Join-Path $repoRoot 'SOURCE_MANIFEST_SHA256.json'
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) { throw 'Source manifest missing.' }
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
$count = 0
foreach ($entry in $manifest.files.PSObject.Properties) {
    $target = Join-Path $repoRoot ($entry.Name -replace '/', '\')
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Missing source file: $($entry.Name)" }
    $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($actual -ne $entry.Value) { throw "Source checksum mismatch: $($entry.Name)" }
    $count++
}
$forbidden = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File | Where-Object {
    $_.FullName -notmatch '[\\/]\.git[\\/]' -and (
        $_.Name -in @('Preferences','Secure Preferences') -or
        $_.Name -match '(?i)(\.sqlite3?$|\.fbdb$|\.db$|\.pem$|\.key$|\.p12$|\.pfx$|^\.env($|\.))'
    )
})
if ($forbidden.Count) { $forbidden | Select-Object -ExpandProperty FullName; throw 'Potentially sensitive files present.' }
Write-Host "Verified $count source-file hashes. No private filename matches." -ForegroundColor Green
Write-Host 'This is NOT a guarantee against secrets or personal data hidden in arbitrary text files.' -ForegroundColor Yellow
Write-Host 'Review SECURITY_REVIEW.txt and repo contents manually before pushing.'
