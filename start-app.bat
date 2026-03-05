@echo off
setlocal EnableExtensions

node "%~dp0scripts\bootstrap-and-start.js"
set "exit_code=%errorlevel%"

echo.
echo Application has closed. Press any key to exit.
pause >nul

endlocal & exit /b %exit_code%
