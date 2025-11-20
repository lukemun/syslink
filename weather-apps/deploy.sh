#!/bin/bash

# Weather Crawler Deployment Script
#
# Usage:
#   ./deploy.sh [stage]
#
# Examples:
#   ./deploy.sh              # Deploy to dev (default)
#   ./deploy.sh production   # Deploy to production

set -e

STAGE=${1:-dev}
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

echo "=== Weather Crawler Deployment ==="
echo "Stage: $STAGE"
echo ""

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env file not found at $ENV_FILE"
    echo "Please create .env file with AWS credentials and DATABASE_URL"
    exit 1
fi

# Load environment variables
echo "Loading environment variables from $ENV_FILE..."
set -a
source "$ENV_FILE"
set +a

# Verify required variables
if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "Error: AWS_ACCESS_KEY_ID not set in .env"
    exit 1
fi

if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo "Error: AWS_SECRET_ACCESS_KEY not set in .env"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL not set in .env"
    exit 1
fi

echo "✓ Environment variables loaded"
echo ""

# Deploy using SST
echo "Deploying to AWS (stage: $STAGE)..."
npx sst deploy --stage "$STAGE"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "To view logs:"
echo "  npx sst logs --stage $STAGE"
echo ""
echo "To remove stack:"
echo "  npx sst remove --stage $STAGE"

