# DR Deploy - Auto Update and Start
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "   DR Deploy - Auto Update and Start" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host

Write-Host "Pulling latest changes from git..." -ForegroundColor Yellow
git pull
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to pull from git. Please check your git setup." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host
Write-Host "Installing/updating dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host
Write-Host "Starting the application..." -ForegroundColor Green
npm start

Write-Host
Write-Host "Application has closed." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
