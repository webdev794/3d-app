@echo off
rem 3DEEZI on this computer: double-click to start.
rem The website (http://127.0.0.1:8000) runs in its own window; the app preview (http://localhost:8088) runs in this one.
rem Close both windows to stop them.
start "3DEEZI website - port 8000" powershell -NoExit -ExecutionPolicy Bypass -Command "cd D:\3d-app\3d-app\website; .\serve.ps1"
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8000
cd /d D:\3d-app\3d-app
node scripts\serve_preview.mjs
pause
