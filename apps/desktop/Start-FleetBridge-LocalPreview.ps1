Clear-Host
$ErrorActionPreference = 'Stop'
$port = 18747
$baseUrl = "http://127.0.0.1:$port"

try {
  Write-Host '========== FLEETBRIDGE V2.4 ==========' -ForegroundColor Cyan
  $nodeCommand = Get-Command node.exe -ErrorAction Stop
  $majorVersion = [int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0])
  if ($majorVersion -lt 24) { throw 'FleetBridge V2.4 requires Node.js 24 or newer.' }
  $previewScript = Join-Path $PSScriptRoot 'Desktop\preview.js'
  if (-not (Test-Path -LiteralPath $previewScript)) { throw "Missing V2.4 files: $previewScript" }
  $listener = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  if ($listener.Count -gt 0) {
    try {
      $r = Invoke-RestMethod -Uri "$baseUrl/api/auth/status" -TimeoutSec 2
      if ($null -eq $r.authenticated) { throw 'Unknown process' }
      Write-Host '[OK] Existing FleetBridge V2.4 process identified.' -ForegroundColor Green
    }
    catch { throw "Port $port is used by an unidentified application. No process was stopped." }
  }
  else {
    $logs = Join-Path $env:LOCALAPPDATA 'FleetBridgeV24PreviewData\Logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    Write-Host 'Starting isolated FleetBridge V2.4 on port 18747...'
    $null = Start-Process -FilePath $nodeCommand.Source -ArgumentList ('"' + $previewScript + '"') `
      -WorkingDirectory (Split-Path $previewScript -Parent) -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $logs "start_$stamp.log") `
      -RedirectStandardError (Join-Path $logs "error_$stamp.log")
    $ready = $false
    for ($i=0; $i -lt 50; $i++) {
      Start-Sleep -Milliseconds 200
      try {
        $check = Invoke-RestMethod -Uri "$baseUrl/api/auth/status" -TimeoutSec 1
        if ($null -ne $check.authenticated) { $ready = $true; break }
      } catch {}
    }
    if (-not $ready) { throw "V2.4 did not start. Check logs in $logs" }
    Write-Host '[OK] Secure session gate responding.' -ForegroundColor Green
  }
  Start-Process "$baseUrl/"
  Write-Host '[OK] FleetBridge V2 opened. V1, Chrome and TTEA were not modified.' -ForegroundColor Green
}
catch {
  Write-Host "FleetBridge V2.4 could not start: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host 'Press Enter to close this window'
  exit 1
}
