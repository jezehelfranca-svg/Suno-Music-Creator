@echo off
title Suno Music Pipeline Studio Dashboard
set "BASE_DIR=%MUSIC_PIPELINE_DIR%"
if "%BASE_DIR%"=="" set "BASE_DIR=C:\Music_Pipeline"

set "SERVER_SCRIPT=%~dp0..\pipeline_server.py"
if not exist "%SERVER_SCRIPT%" set "SERVER_SCRIPT=%BASE_DIR%\Automation\pipeline_server.py"

echo ========================================================
echo   Launching Suno Music Pipeline Studio Dashboard
echo   Base Directory : %BASE_DIR%
echo   Server Script  : %SERVER_SCRIPT%
echo   Dashboard URL  : http://localhost:8765
echo ========================================================

:: Check if port 8765 is already listening
netstat -ano | findstr /R /C:":8765 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Pipeline Studio Server is already running on port 8765.
) else (
    echo [INFO] Starting pipeline_server.py daemon...
    start "Suno Pipeline Server" /min python "%SERVER_SCRIPT%" --base-dir "%BASE_DIR%" --preset gentle
    timeout /t 2 /nobreak >nul
)

:: Open browser
echo [INFO] Opening Web Dashboard at http://localhost:8765...
start "" "http://localhost:8765"
exit /b 0
