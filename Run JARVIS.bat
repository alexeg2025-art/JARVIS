@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo JARVIS dependencies are missing. Run npm install in this folder first.
  pause
  exit /b 1
)
if not exist "dist-electron\main.js" (
  echo JARVIS has not been built yet. Building it now...
  call npm run build
  if errorlevel 1 (
    echo Build failed. See the error above.
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
