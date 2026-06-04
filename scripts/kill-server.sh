#!/bin/bash
# kill-server.sh — Find and kill any process holding port 3002 or 5173.
# Safe to run even when nothing is listening.

PORTS=(3002 5173)

for PORT in "${PORTS[@]}"; do
  # lsof -ti returns the PID(s) owning the port; empty if nothing is there
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "  → Killing process(es) on port $PORT: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null
  else
    echo "  ✓ Port $PORT is free"
  fi
done

# Also sweep any stray 'node server.js' processes from this project.
# PROJECT_DIR resolves one level up from scripts/ to the actual project root.
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PIDS=$(pgrep -f "node ${PROJECT_DIR}/server.js" 2>/dev/null)
if [ -n "$NODE_PIDS" ]; then
  echo "  → Killing stray server.js process(es): $NODE_PIDS"
  echo "$NODE_PIDS" | xargs kill -9 2>/dev/null
fi

echo ""
echo "Done. Ports cleared."
