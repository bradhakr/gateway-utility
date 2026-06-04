#!/bin/bash
# prod-server.sh — Build and serve the Gateway Utility in production mode.
#                  Express serves both the API (:3002) and the built React app.
#                  Clears port 3002 before starting to avoid EADDRINUSE errors.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Gateway Utility — Production Server ==="
echo ""
echo "Clearing any processes already holding port 3002..."
bash "${SCRIPT_DIR}/kill-server.sh"

echo ""
echo "Building React app..."
cd "$PROJECT_DIR"
npm run build

echo ""
echo "Starting production server (Express :3002)..."
echo "Press Ctrl-C to stop."
echo ""

cleanup() {
  echo ""
  echo "Shutting down..."
  bash "${SCRIPT_DIR}/kill-server.sh"
  exit 0
}
trap cleanup INT TERM

npm start
