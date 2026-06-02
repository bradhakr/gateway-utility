#!/bin/bash
# Dev.sh — Start the Gateway Utility in development mode (hot reload).
#           Clears ports 3002 and 5173 before starting so stale processes
#           never cause EADDRINUSE errors.

set -e
cd "$(dirname "$0")"

echo "=== Gateway Utility — Dev Server ==="
echo ""
echo "Clearing any processes already holding the required ports..."
bash kill-server.sh

echo ""
echo "Starting development server (Express :3002 + Vite :5173)..."
echo "Press Ctrl-C to stop."
echo ""

# Trap Ctrl-C so the cleanup runs on exit too
cleanup() {
  echo ""
  echo "Shutting down..."
  bash kill-server.sh
  exit 0
}
trap cleanup INT TERM

npm run dev
