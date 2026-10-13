@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for the prebuilt preview. Install Node.js or run the Flutter source.
  pause
  exit /b 1
)
echo Open http://localhost:8088 in your browser.
if exist serve.mjs (
  node serve.mjs
) else (
  node serve_preview.mjs
)
pause
