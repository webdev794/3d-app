@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for the web preview.
  pause
  exit /b 1
)
if exist serve.mjs (
  node serve.mjs --lan
) else (
  node serve_preview.mjs --lan
)
pause
