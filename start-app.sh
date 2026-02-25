#!/bin/bash

echo "==========================================="
echo "   DR Deploy - Auto Update and Start"
echo "==========================================="
echo ""

echo "Pulling latest changes from git..."
git pull > git_pull_output.tmp 2>&1
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to pull from git. Please check your git setup."
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if there were any updates
if grep -q "Already up to date" git_pull_output.tmp; then
    echo "No updates found. Skipping npm install."
    skip_npm=true
else
    echo "Updates found. Running npm install..."
    skip_npm=false
fi

# Clean up temporary file
rm -f git_pull_output.tmp

echo ""
if [ "$skip_npm" = false ]; then
    echo "Installing/updating dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies."
        read -p "Press Enter to exit..."
        exit 1
    fi
else
    echo "Skipping npm install - no updates were pulled."
fi

echo ""
echo "Starting the application..."
npm start

echo ""
echo "Application has closed. Press Enter to exit."
read -p ""
