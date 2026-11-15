@echo off
setlocal
cd /d "%~dp0"

rem The app is a single self-contained HTML file in this folder.
rem If it exists, just open it: offline, no server, no Node.js needed.
for %%F in ("%~dp0*.html") do (
  start "" "%%~fF"
  exit /b 0
)

echo The single-file build was not found. Building it now (first run only)...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js LTS from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies. Please wait...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed. Check the network and try again.
    pause
    exit /b 1
  )
)

call npm.cmd run build
if errorlevel 1 (
  echo.
  echo Build failed. Please check the messages above.
  pause
  exit /b 1
)

for %%F in ("%~dp0*.html") do (
  start "" "%%~fF"
  exit /b 0
)
