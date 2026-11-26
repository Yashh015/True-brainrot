# True Brainrot installer: downloads the latest release, installs it silently, adds the Claude Code plugin.
# Usage: irm <site>/install.ps1 | iex      (add -DryRun by saving the file and running it directly)
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$releases = 'https://github.com/Yashh015/True-brainrot/releases/latest'
$api = if ($env:TB_API) { $env:TB_API } else { 'https://api.github.com/repos/Yashh015/True-brainrot/releases/latest' }
$claude = if ($env:TB_CLAUDE) { $env:TB_CLAUDE } else { 'claude' }
$marketplace = 'claude plugin marketplace add Yashh015/True-brainrot'
$install = 'claude plugin install true-brainrot@true-brainrot'

function Stop-Here($msg) { Write-Host $msg; exit 1 }

# 1. Find the latest installer.
try {
    if ($api -like 'file:*') { $rel = Get-Content -Raw -LiteralPath ([Uri]$api).LocalPath | ConvertFrom-Json }
    else { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $rel = Invoke-RestMethod -Uri $api -UseBasicParsing -Headers @{ 'User-Agent' = 'true-brainrot-installer' } }
    $url = ($rel.assets | Where-Object { $_.browser_download_url -like '*.exe' } | Select-Object -First 1).browser_download_url
    if (-not $url) { throw 'no installer' }
} catch { Stop-Here "Couldn't reach GitHub (or no installer is published yet). Get it here: $releases" }

# 2. Download and install silently.
Write-Host "Download $url"
$exe = Join-Path $env:TEMP 'TrueBrainrotSetup.exe'
if (-not $DryRun) {
    try { Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing } catch { Stop-Here "Download failed. Get it here: $releases" }
}
Write-Host 'Install silently'
if (-not $DryRun) {
    try { Start-Process -FilePath $exe -ArgumentList '/S' -Wait } catch { Stop-Here "The installer didn't run. Run it by hand from: $releases" }
}

# 3. Add the Claude Code plugin.
if (-not (Get-Command $claude -ErrorAction SilentlyContinue)) {
    Write-Host 'The app is installed, but Claude Code (claude) was not found on PATH.'
    Write-Host 'Paste these into Claude Code:'
    Write-Host "  $marketplace"
    Write-Host "  $install"
    exit 1
}
Write-Host $marketplace
Write-Host $install
if (-not $DryRun) {
    try {
        & $claude plugin marketplace add Yashh015/True-brainrot
        & $claude plugin install true-brainrot@true-brainrot
    } catch { Stop-Here "Couldn't add the plugin. Paste these into Claude Code:`n  $marketplace`n  $install" }
}
Write-Host 'Done. Open True Brainrot and log in to your feeds in the panel.'
