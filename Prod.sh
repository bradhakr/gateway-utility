#!/bin/bash
# Prod.sh — Build and serve the Gateway Utility in production mode.
#            Express serves both the API (:3002) and the built React app.
#            Clears port 3002 before starting to avoid EADDRINUSE errors.

set -e
cd "$(dirname "$0")"

echo "=== Gateway Utility — Production Server ==="
echo ""
echo "Clearing any processes already holding port 3002..."
bash kill-server.sh

echo ""
echo "Building React app..."
npm run build

echo ""
echo "Starting production server (Express :3002)..."
echo "Press Ctrl-C to stop."
echo ""

# Trap Ctrl-C / SIGTERM so cleanup runs on exit too
cleanup() {
  echo ""
  echo "Shutting down..."
  bash kill-server.sh
  exit 0
}
trap cleanup INT TERM

npm start
