@echo off
title Run Suno Music Pipeline Once
set "BASE_DIR=%MUSIC_PIPELINE_DIR%"
if "%BASE_DIR%"=="" set "BASE_DIR=C:\Music_Pipeline"

set "AUTOMATOR_SCRIPT=%~dp0..\pipeline_automator.py"
if not exist "%AUTOMATOR_SCRIPT%" set "AUTOMATOR_SCRIPT=%BASE_DIR%\Automation\pipeline_automator.py"

echo ========================================================
echo   Running Suno Music Pipeline (Single Pass)
echo   Base Directory : %BASE_DIR%
echo   Script         : %AUTOMATOR_SCRIPT%
echo   Preset         : gentle
echo ========================================================
python "%AUTOMATOR_SCRIPT%" --base-dir "%BASE_DIR%" --once --preset gentle
echo.
echo ========================================================
echo   Pipeline single pass execution complete.
echo ========================================================
pause
