@echo off
rem Send this project's changes to GitHub (https://github.com/ansellreff/karina-proofread),
rem then check that the online app on Vercel has updated. Double-click, or run "push.bat" in a terminal.
setlocal
set "MSG="
cd /d "%~dp0"
set "PATH=%~dp0.tools\node;%PATH%"
set "APP_URL=https://karina-proofread.vercel.app"

echo.
echo === Karina Proofread: send changes to GitHub ===
echo.
git add -A
git status --short
git diff --cached --quiet
if %errorlevel%==0 (
  echo No new changes to save.
) else (
  echo.
  set /p MSG=Describe the changes in a few words, then press Enter:
)

echo.
node web\scripts\prepush-check.mjs
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)

if not defined MSG set "MSG=Update"
git diff --cached --quiet
if errorlevel 1 git -c user.name="Karina Octavia" -c user.email=reffriandi@gmail.com commit -q -m "%MSG%"

echo.
echo Sending to GitHub...
git push
if errorlevel 1 (
  echo.
  echo The push did not go through. If a GitHub sign-in window opened, approve it and run push.bat again.
  pause
  exit /b 1
)

node web\scripts\vercel-check.mjs %APP_URL%
echo.
pause
