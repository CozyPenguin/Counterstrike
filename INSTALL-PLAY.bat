@echo off
REM Counterstrike - install and host the game on this computer.
REM
REM Double click this file to install the game, start the server and get the
REM addresses your friends have to open.
REM
REM   INSTALL-PLAY.bat              install, build and host
REM   INSTALL-PLAY.bat --no-open    do not open a browser
REM   INSTALL-PLAY.bat --port 8080  use a different port
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js 18 or newer is required but was not found.
  echo   Install it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

node scripts\host-lan.mjs %*
echo.
echo   The server has stopped.
pause >nul
