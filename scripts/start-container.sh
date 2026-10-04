#!/bin/bash
set -euo pipefail
/opt/media/bin/python backend/server.py &
media_pid=$!
node server.js &
next_pid=$!
trap 'kill "$media_pid" "$next_pid" 2>/dev/null || true' EXIT INT TERM
wait -n "$media_pid" "$next_pid"
