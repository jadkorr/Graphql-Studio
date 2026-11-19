#!/usr/bin/env bash
# Start GraphQL Studio in the background.
#   ./start.sh        production: build + serve on http://127.0.0.1:4100
#   ./start.sh dev    development: proxy + Vite with hot reload on http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-prod}"
RUN_DIR=".run"
PID_FILE="$RUN_DIR/studio.pid"
LOG_FILE="$RUN_DIR/studio.log"
PORT="${PORT:-4100}"
mkdir -p "$RUN_DIR"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "GraphQL Studio is already running (PID $(cat "$PID_FILE")). Use ./stop.sh first."
  exit 1
fi
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use by another process:"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN
  exit 1
fi

[[ -d node_modules ]] || { echo "Installing dependencies…"; npm install; }

case "$MODE" in
  prod)
    echo "Building…"
    npm run build >"$LOG_FILE" 2>&1 || { echo "Build failed, see $LOG_FILE"; exit 1; }
    CMD=(node server/index.js)
    URL="http://127.0.0.1:$PORT"
    ;;
  dev)
    CMD=(npm run dev)
    URL="http://localhost:5173"
    ;;
  *)
    echo "Usage: $0 [prod|dev]"; exit 1 ;;
esac

# set -m gives the background job its own process group so stop.sh can kill all children
set -m
nohup "${CMD[@]}" >>"$LOG_FILE" 2>&1 &
PID=$!
set +m
echo "$PID" >"$PID_FILE"

for _ in $(seq 1 30); do
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "GraphQL Studio ($MODE) running → $URL  (PID $PID, log: $LOG_FILE)"
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "Failed to start, see $LOG_FILE:"; tail -n 20 "$LOG_FILE"; rm -f "$PID_FILE"; exit 1
  fi
  sleep 0.5
done
echo "Started (PID $PID) but port $PORT is not listening yet. Check $LOG_FILE"
