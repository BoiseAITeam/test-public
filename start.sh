#!/bin/bash
# InsureTrack Startup Script
# Run this from the insuretrack directory
#
# Prerequisites:
#   - Node.js 18+ installed
#   - A .env file with DATABASE_URL and JWT_SECRET (see .env.example)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🏗️  Starting InsureTrack..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --silent
fi

# Start server
echo "Starting server on http://localhost:${PORT:-3001}..."
node server.js
