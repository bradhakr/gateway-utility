#!/bin/bash
# dev-server.sh — Start the Gateway Utility in development mode (hot reload).
#                 Clears ports 3002 and 5173 before starting so stale processes
#                 never cause EADDRINUSE errors.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Gateway Utility — Dev Server ==="
echo ""
echo "Clearing any processes already holding the required ports..."
bash "${SCRIPT_DIR}/kill-server.sh"

echo ""
echo "Starting development server (Express :3002 + Vite :5173)..."
echo "Press Ctrl-C to stop."
echo ""

cleanup() {
  echo ""
  echo "Shutting down..."
  bash "${SCRIPT_DIR}/kill-server.sh"
  exit 0
}
trap cleanup INT TERM

cd "$PROJECT_DIR"
npm run dev
