#!/usr/bin/env bash
cd "$(dirname "$0")"
export PORT=10314
echo "Starting EV Hub Investment Tool FULL HTML App v33 on http://localhost:10314/ ..."
echo "If an old Site Location-only dashboard is open on port 8000, ignore it and use port 10314."
python3 local_site_location_server.py
