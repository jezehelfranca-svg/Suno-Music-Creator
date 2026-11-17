@echo off
title Suno Music Pipeline Unified Studio & Watcher
set "BASE_DIR=%MUSIC_PIPELINE_DIR%"
if "%BASE_DIR%"=="" set "BASE_DIR=C:\Music_Pipeline"

set "SERVER_SCRIPT=%~dp0..\pipeline_server.py"
if not exist "%SERVER_SCRIPT%" set "SERVER_SCRIPT=%BASE_DIR%\Automation\pipeline_server.py"

echo ========================================================
echo   Starting Suno Music Pipeline Unified Watcher & Studio
echo   Base Directory : %BASE_DIR%
echo   Server Script  : %SERVER_SCRIPT%
echo   Web Dashboard  : http://localhost:8765
echo   Preset         : gentle
echo ========================================================
python "%SERVER_SCRIPT%" --base-dir "%BASE_DIR%" --preset gentle
pause
