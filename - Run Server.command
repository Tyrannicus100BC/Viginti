#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the project directory
cd "$SCRIPT_DIR"

# Print a friendly message
echo "Starting Character Prototype Server..."
echo "Project directory: $SCRIPT_DIR"
echo ""

# Install packages
npm install

# Start the server
npm run dev

# Keep the terminal open if there's an error
if [ $? -ne 0 ]; then
    echo ""
    echo "Press any key to close this window..."
    read -n 1
fi
