<#
Keep FleetBridge Discovery installed from one unchanging directory.
Run once to install from an unpacked release; run again after each source update.
When a Git repository is configured, later runs pull directly without a ZIP.
#>
param(
    [string]$RepositoryUrl = "",
    [string]$SourceFolder = "",
    [string]$InstallFolder = ""
)

Clear-Host
$ErrorActionPreference = 'Stop'
Write-Host "FLEETBRIDGE DISCOVERY - STABLE UPDATE" -ForegroundColor Cyan
if (-not $InstallFolder) {
    $InstallFolder = (Read-Host "Paste your EXISTING unpacked extension folder (keep same Chrome ID)").Trim('"')
}
if (-not $InstallFolder) { throw "An explicit existing installation path is required to protect Chrome data." }
if (-not (Test-Path -LiteralPath (Join-Path $InstallFolder 'manifest.json'))) {
    Write-Host "WARNING: This is a NEW extension location. Chrome may give it a new ID and its own empty database." -ForegroundColor Yellow
    Write-Host "Before changing folders, export a JSON backup from your OLD extension; restore it in the new Workspace." -ForegroundColor Yellow
    $Proceed = Read-Host "Continue with a new installation location? Type YES"
    if ($Proceed -cne 'YES') { throw "Stopped to protect your existing candidate records." }
}

if ($RepositoryUrl) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is not installed. Install Git for Windows or use -SourceFolder."
    }
    if (Test-Path -LiteralPath (Join-Path $InstallFolder '.git')) {
        & git -C $InstallFolder pull --ff-only
        if ($LASTEXITCODE -ne 0) { throw "Git update failed. Installed files were not reset." }
    } else {
        if (Test-Path -LiteralPath $InstallFolder -PathType Container) {
            $existing = @(Get-ChildItem -LiteralPath $InstallFolder -Force)
            if ($existing.Count -gt 0) {
                throw "The installation folder already has files. Set up a Git remote there manually or use -SourceFolder to update in place."
            }
        }
        & git clone --depth 1 -- $RepositoryUrl $InstallFolder
        if ($LASTEXITCODE -ne 0) { throw "Git clone failed." }
    }
} else {
    if (-not $SourceFolder) {
        $SourceFolder = (Read-Host "Paste the REAL folder path containing manifest.json").Trim('"')
    }
    if (-not (Test-Path -LiteralPath $SourceFolder -PathType Container)) {
        throw "Source folder does not exist: $SourceFolder"
    }
    $SourceManifest = Join-Path $SourceFolder 'manifest.json'
    if (-not (Test-Path -LiteralPath $SourceManifest -PathType Leaf)) {
        throw "This is not the extension folder: manifest.json is missing."
    }
    $SourceInfo = Get-Content -LiteralPath $SourceManifest -Raw | ConvertFrom-Json
    if ($SourceInfo.name -ne 'FleetBridge Discovery') {
        throw "Source manifest is not FleetBridge Discovery."
    }
    $SourceFull = [IO.Path]::GetFullPath($SourceFolder).TrimEnd('\')
    $InstallFull = [IO.Path]::GetFullPath($InstallFolder).TrimEnd('\')
    if ($SourceFull -eq $InstallFull) {
        Write-Host "Source is already the permanent installation folder." -ForegroundColor Yellow
    } else {
        New-Item -ItemType Directory -Force -Path $InstallFolder | Out-Null
        # Only extension program files are copied. Never wipe saved profiles,
        # browser storage, existing folders, or a configured Git checkout.
        $Allowed = @('.json', '.js', '.html', '.css', '.svg', '.png', '.md')
        $Files = @(Get-ChildItem -LiteralPath $SourceFolder -File | Where-Object {
            $Allowed -contains $_.Extension.ToLowerInvariant() -and
            $_.Name -notmatch '^\.env' -and $_.Name -notmatch '(secret|credential|token|private)'
        })
        if ($Files.Count -lt 10) {
            throw "Not enough extension program files in the source. Nothing was updated."
        }
        $InstalledManifest = Join-Path $InstallFolder 'manifest.json'
        if (Test-Path -LiteralPath $InstalledManifest -PathType Leaf) {
            $InstalledInfo = Get-Content -LiteralPath $InstalledManifest -Raw | ConvertFrom-Json
            if ($InstalledInfo.name -ne 'FleetBridge Discovery') {
                throw "Refusing to overwrite a different extension."
            }
            # Keep a recoverable snapshot of the program files that will be replaced.
            # It is deliberately outside Chrome's extension folder and never includes Chrome data.
            $BackupFolder = Join-Path ([IO.Path]::GetDirectoryName($InstallFull)) (
                "FleetBridge_PreUpdate_{0}_{1}" -f (Get-Date -Format 'yyyyMMdd_HHmmss'), [guid]::NewGuid().ToString('N').Substring(0,8)
            )
            New-Item -ItemType Directory -Path $BackupFolder | Out-Null
            foreach ($File in $Files) {
                $Previous = Join-Path $InstallFolder $File.Name
                if (Test-Path -LiteralPath $Previous -PathType Leaf) {
                    Copy-Item -LiteralPath $Previous -Destination (Join-Path $BackupFolder $File.Name) -ErrorAction Stop
                }
            }
            $PreviousUpdater = Join-Path $InstallFolder 'Update-FleetBridge.ps1'
            if (Test-Path -LiteralPath $PreviousUpdater -PathType Leaf) {
                Copy-Item -LiteralPath $PreviousUpdater -Destination $BackupFolder -ErrorAction Stop
            }
            Write-Host "Program-file backup: $BackupFolder" -ForegroundColor Cyan
        }
        foreach ($File in $Files) {
            Copy-Item -LiteralPath $File.FullName -Destination (Join-Path $InstallFolder $File.Name) -Force
        }
        Copy-Item -LiteralPath (Join-Path $SourceFolder 'Update-FleetBridge.ps1') -Destination (Join-Path $InstallFolder 'Update-FleetBridge.ps1') -Force
        Write-Host "Updated $($Files.Count) extension files." -ForegroundColor Green
    }
}

$Manifest = Join-Path $InstallFolder 'manifest.json'
if (-not (Test-Path -LiteralPath $Manifest)) { throw "Installation has no manifest.json. Check the source repository/folder." }
$Version = (Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json).version
if ($SourceFolder -and $SourceInfo -and $Version -ne $SourceInfo.version) {
    throw "Version verification failed. Expected $($SourceInfo.version), got $Version."
}
Write-Host "Installed version: $Version" -ForegroundColor Green
Write-Host "Permanent directory: $InstallFolder" -ForegroundColor Cyan
Write-Host "Open chrome://extensions, enable Developer mode and click Reload on FleetBridge Discovery." -ForegroundColor Yellow
Write-Host "If this extension is already installed from that directory, do NOT remove or reinstall it." -ForegroundColor Yellow
Write-Host "Only for a NEW folder: use Load unpacked and restore the OLD Workspace JSON backup." -ForegroundColor Yellow
Start-Process 'chrome://extensions/'
