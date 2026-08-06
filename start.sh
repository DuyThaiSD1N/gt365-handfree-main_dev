#!/usr/bin/env bash
set -euo pipefail

APP_NAME="gt365-handfree"
FE_PORT="${FE_PORT:-5175}"
BE_PORT="${BE_PORT:-14673}"
HOST="${HOST:-0.0.0.0}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting ${APP_NAME} (voice bridge on ${BE_PORT}, FE on ${FE_PORT})..."

kill_port() {
  local port="$1"
  local name="$2"
  local pid

  echo "Checking port ${port} (${name})..."
  pid="$(lsof -ti:"${port}" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    echo "  No process on port ${port}."
    return
  fi

  echo "  Found PID(s): ${pid}. Stopping..."
  echo "$pid" | xargs kill 2>/dev/null || true
  sleep 1

  pid="$(lsof -ti:"${port}" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    echo "  Still alive. Force stopping PID(s): ${pid}"
    echo "$pid" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
  echo "  Port ${port} freed."
}

kill_port "$BE_PORT" "voice bridge"
kill_port "$FE_PORT" "frontend"

mkdir -p logs

echo "Starting voice bridge..."
: > logs/be.log
PORT="$BE_PORT" HOST="$HOST" nohup npm run dev:be > logs/be.log 2>&1 &
BE_PID=$!

echo "Starting frontend..."
: > logs/fe.log
VITE_VOICE_BRIDGE_TARGET="http://localhost:${BE_PORT}" \
  nohup npm run dev -- --host "$HOST" --port "$FE_PORT" > logs/fe.log 2>&1 &
FE_PID=$!

echo ""
echo "================================"
echo "All services started"
echo "================================"
echo "Voice bridge PID: ${BE_PID}"
echo "Frontend PID:     ${FE_PID}"
echo "Voice bridge:     http://localhost:${BE_PORT}/api/voice-health"
echo "Frontend:         http://localhost:${FE_PORT}/"
echo "BE logs:          tail -f logs/be.log"
echo "FE logs:          tail -f logs/fe.log"
echo "Stop:             ./stop.sh"
echo "================================"

