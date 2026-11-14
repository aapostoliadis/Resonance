@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js, then run this launcher again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4387 in Chrome or Edge.
echo Keep this window open while using Resonance. Press Ctrl+C to stop.
node server.cjs
pause
