#!/bin/sh
# Start Git Quest on http://localhost:8000 (Ctrl+C to stop).
cd "$(dirname "$0")"
PORT="${1:-8000}"
echo "🍄 Git Quest running at http://localhost:$PORT"
( sleep 1 && open "http://localhost:$PORT" ) >/dev/null 2>&1 &
python3 -m http.server "$PORT" --bind 127.0.0.1
