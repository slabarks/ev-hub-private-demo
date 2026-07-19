#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
export PORT="${PORT:-10314}"
export EVHUB_ALLOW_PORT_FALLBACK=1
echo "Starting EV Hub Investment Tool V21.2..."
echo "The browser will open only after the matching Python backend has started."
python3 server.py
