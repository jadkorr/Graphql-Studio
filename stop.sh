#!/usr/bin/env bash
# Stop GraphQL Studio started with ./start.sh
set -uo pipefail
cd "$(dirname "$0")"

PID_FILE=".run/studio.pid"
PORT="${PORT:-4100}"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  # only act on a numeric PID that still belongs to this app (PIDs get reused after a crash/reboot)
  if [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null && ps -o command= -p "$PID" | grep -qE "node|npm"; then
    # kill the whole process group (npm/concurrently/vite children included)
    kill -TERM -- "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null
    for _ in $(seq 1 10); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$PID" 2>/dev/null && kill -KILL -- "-$PID" 2>/dev/null
    echo "GraphQL Studio stopped (PID $PID)."
  else
    echo "No process with PID $PID (stale PID file)."
  fi
  rm -f "$PID_FILE"
else
  echo "No PID file found."
fi

# fallback: anything still listening on the studio ports from this project
for P in "$PORT" 5173; do
  for LP in $(lsof -t -nP -iTCP:"$P" -sTCP:LISTEN 2>/dev/null); do
    if ps -o command= -p "$LP" | grep -qE "server/index.js|vite"; then
      kill "$LP" && echo "Stopped leftover process $LP on port $P."
    fi
  done
done
