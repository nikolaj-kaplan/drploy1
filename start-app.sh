#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

node "$SCRIPT_DIR/scripts/bootstrap-and-start.js"
exit_code=$?

echo ""
echo "Application has closed. Press Enter to exit."
read -p ""

exit "$exit_code"
