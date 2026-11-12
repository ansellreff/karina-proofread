@echo off
rem Karina Proofread Bot - run the app on this PC (http://localhost:3000) to try changes before pushing.
rem Uses the project's own Node (.tools\node), like dev.ps1: nothing is installed on Windows.
rem Close this window (or press Ctrl+C) to stop the app.

setlocal
set "ROOT=%~dp0"
set "PATH=%ROOT%.tools\node;%ROOT%.tools\npm-global;%PATH%"
set "npm_config_cache=%ROOT%.tools\npm-cache"
set "npm_config_prefix=%ROOT%.tools\npm-global"
set "npm_config_userconfig=%ROOT%.tools\npmrc"
set "npm_config_update_notifier=false"
set "NEXT_TELEMETRY_DISABLED=1"

if not exist "%ROOT%.tools\node\node.exe" (
  echo The project's Node.js is missing in .tools\node. Ask Claude to set it up again.
  pause
  exit /b 1
)

cd /d "%ROOT%web"
title Karina Proofread Bot - localhost:3000

rem Already running? Just open it.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:3000/api/version | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  echo The app is already running. Opening http://localhost:3000 ...
  start "" http://localhost:3000
  timeout /t 3 >nul
  exit /b 0
)

echo Starting Karina Proofread Bot on http://localhost:3000 ...
echo The browser opens once it is ready. Keep this window open while you use the app.
echo.
rem open the browser as soon as the app answers (in the background)
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:3000/api/version | Out-Null; Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Seconds 1 } }"
call npm run dev
echo.
echo The app has stopped.
pause
