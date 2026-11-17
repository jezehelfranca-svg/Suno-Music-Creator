@echo off
title Stop Suno Music Pipeline Watcher
set "BASE_DIR=%MUSIC_PIPELINE_DIR%"
if "%BASE_DIR%"=="" set "BASE_DIR=C:\Music_Pipeline"

echo ========================================================
echo   Stopping Suno Music Pipeline Watcher Daemon
echo ========================================================

set "PID_FILE=%BASE_DIR%\Automation\.watcher.pid"
set "SERVER_PID_FILE=%BASE_DIR%\Automation\.server.pid"
set "FOUND_PID=0"

if exist "%PID_FILE%" (
    set /p WATCHER_PID=<"%PID_FILE%"
    call echo [INFO] Found Watcher PID: %%WATCHER_PID%%
    call taskkill /PID %%WATCHER_PID%% /T /F >nul 2>&1
    del /F /Q "%PID_FILE%" >nul 2>&1
    set "FOUND_PID=1"
)

if exist "%SERVER_PID_FILE%" (
    set /p SERVER_PID=<"%SERVER_PID_FILE%"
    call echo [INFO] Found Server PID: %%SERVER_PID%%
    call taskkill /PID %%SERVER_PID%% /T /F >nul 2>&1
    del /F /Q "%SERVER_PID_FILE%" >nul 2>&1
    set "FOUND_PID=1"
)

if "%FOUND_PID%"=="1" (
    echo [OK] Suno Music Pipeline Watcher stopped successfully.
) else (
    echo [INFO] No active watcher PID file found.
)

echo.
pause
