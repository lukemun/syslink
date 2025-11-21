#!/bin/bash
# Setup script for DealMachine lead uploader

echo "Setting up virtual environment..."

# Create venv if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing requirements..."
pip install -r requirements.txt

echo ""
echo "✓ Setup complete!"
echo ""
echo "To run the script:"
echo "  python add_leads_to_dealmachine.py"
echo ""
echo "Remember to set your DealMachine API key in add_leads_to_dealmachine.py first!"





