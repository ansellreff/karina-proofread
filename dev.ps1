# Karina Proofread Bot - isolated dev environment.
# Usage (from the project root, in any PowerShell window):
#     . .\dev.ps1
# Changes apply to THIS terminal session only. Nothing is installed on Windows,
# and no system/user PATH, registry or profile settings are modified.

$root = $PSScriptRoot

# Portable Node.js (project-local)
$env:PATH = "$root\.tools\node;$root\.tools\npm-global;$env:PATH"

# Keep every npm file inside the project (cache, logs, "global" installs, user config)
$env:npm_config_cache      = "$root\.tools\npm-cache"
$env:npm_config_prefix     = "$root\.tools\npm-global"
$env:npm_config_userconfig = "$root\.tools\npmrc"
$env:npm_config_update_notifier = "false"
$env:NEXT_TELEMETRY_DISABLED = "1"

# Python virtual environment (project-local)
$env:PIP_CACHE_DIR = "$root\.tools\pip-cache"
if (Test-Path "$root\.venv\Scripts") {
    $env:VIRTUAL_ENV = "$root\.venv"
    $env:PATH = "$root\.venv\Scripts;$env:PATH"
}

Write-Host "Karina Proofread Bot dev env ready: node $(node --version), python $(python --version 2>&1)" -ForegroundColor Green
