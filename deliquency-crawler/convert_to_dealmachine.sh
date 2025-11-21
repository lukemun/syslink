#!/bin/bash
# Convert delinquent taxes JSON to DealMachine CSV format
# This script activates the virtual environment and runs the conversion

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Run the conversion script
echo "Converting JSON to DealMachine CSV..."
python json_to_dealmachine_csv.py

echo ""
echo "✓ Done! You can now upload dealmachine_import.csv to DealMachine."







