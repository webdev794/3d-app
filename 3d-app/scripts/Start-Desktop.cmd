@echo off
cd /d "%~dp0.."
node scripts\desktop.mjs
if errorlevel 1 pause
