#!/usr/bin/env bash
set -euo pipefail

APP_NAME="gt365-handfree"
FE_PORT="${FE_PORT:-5175}"
BE_PORT="${BE_PORT:-14673}"

echo "Stopping ${APP_NAME}..."

kill_port() {
  local port="$1"
  local name="$2"
  local pid

  pid="$(lsof -ti:"${port}" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    echo "  ${name} not running (port ${port} free)."
    return
  fi

  echo "  Stopping ${name} on port ${port}, PID(s): ${pid}"
  echo "$pid" | xargs kill 2>/dev/null || true
  sleep 1

  pid="$(lsof -ti:"${port}" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    echo "  Force stopping ${name}, PID(s): ${pid}"
    echo "$pid" | xargs kill -9 2>/dev/null || true
  fi

  echo "  ${name} stopped."
}

kill_port "$BE_PORT" "voice bridge"
kill_port "$FE_PORT" "frontend"

echo "Done."

