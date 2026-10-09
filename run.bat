@echo off
title Wildcat CEO - dev server
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo Starting Wildcat CEO at http://localhost:8080
echo Edit files in js\ or css\ and refresh the browser to see changes.
echo Close this window to stop the server.
echo.

rem Open the browser after a short delay so the server is up first.
start /b "" cmd /c "timeout /t 1 /nobreak >nul & start "" http://localhost:8080"

node server.js
pause
