#!/bin/bash
# InsureTrack Startup Script
# Run this from the insuretrack directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="/tmp/insuretrack-run"

echo "🏗️  Starting InsureTrack..."

# Create run dir and copy server files (node_modules must be in a non-mounted path for native modules)
mkdir -p "$RUN_DIR"
cp "$SCRIPT_DIR/server.js" "$RUN_DIR/"
cp "$SCRIPT_DIR/package.json" "$RUN_DIR/"

# Link public folder
ln -sfn "$SCRIPT_DIR/public" "$RUN_DIR/public"

# Install dependencies if needed (only express, bcryptjs, jsonwebtoken - no native modules)
if [ ! -d "$RUN_DIR/node_modules" ]; then
  echo "Installing dependencies..."
  cd "$RUN_DIR"
  cat > package.json << 'PKGJSON'
{
  "name": "insuretrack",
  "version": "1.0.0",
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2"
  }
}
PKGJSON
  npm install --silent
fi

cd "$RUN_DIR"

# Kill any existing instance
pkill -f "node.*--experimental-sqlite.*server.js" 2>/dev/null
sleep 1

# Start server
echo "Starting server on http://localhost:3001..."
node --experimental-sqlite --no-warnings server.js
