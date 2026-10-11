@echo off
cd /d "%~dp0"
python -m pip install --target .python-deps -r requirements-lotus-lamp.txt
if errorlevel 1 (
  echo.
  echo Installation failed. Install Python 3.10 or newer and try again.
  pause
  exit /b 1
)
echo.
echo LotusLamp support installed. Restart JARVIS.
pause
