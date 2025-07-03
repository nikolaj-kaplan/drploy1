@echo off
echo ===========================================
echo    DR Deploy - Auto Update and Start
echo ===========================================
echo.

echo Pulling latest changes from git...
git pull > git_pull_output.tmp 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Failed to pull from git. Please check your git setup.
    pause
    exit /b 1
)

REM Check if there were any updates
findstr /C:"Already up to date" git_pull_output.tmp >nul
if %errorlevel% equ 0 (
    echo No updates found. Skipping npm install.
    set skip_npm=true
) else (
    echo Updates found. Running npm install...
    set skip_npm=false
)

REM Clean up temporary file
del git_pull_output.tmp

echo.
if "%skip_npm%"=="false" (
    echo Installing/updating dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
) else (
    echo Skipping npm install - no updates were pulled.
)

echo.
echo Starting the application...
npm start

echo.
echo Application has closed. Press any key to exit.
pause
