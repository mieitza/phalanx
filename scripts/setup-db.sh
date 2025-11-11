#!/bin/bash
# Database setup script for Phalanx

set -e

# Create data directory if it doesn't exist
mkdir -p "$(dirname "$0")/../data"

echo "Setting up database..."
echo "Note: You'll need to select 'Yes' when prompted by drizzle-kit"
echo ""

cd "$(dirname "$0")/../packages/database"
pnpm drizzle-kit push

echo ""
echo "Database setup complete!"
