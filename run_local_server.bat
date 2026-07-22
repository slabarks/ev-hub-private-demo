@echo off
cd /d "%~dp0"
set PORT=10314
set EVHUB_ALLOW_PORT_FALLBACK=1
echo Starting EV Hub Investment Tool V21.7...
echo The browser will open only after the matching Python backend has started.
echo If port 10314 is occupied by an older build, V21.7 will select the next free port automatically.
echo.
python server.py
pause
