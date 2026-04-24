#!/usr/bin/env bash
# CC pipes a JSON payload on stdin; forward to the local runner HTTP API.
set -euo pipefail
PAYLOAD=$(cat)
curl --max-time 8 -s -X POST \
  -H 'Content-Type: application/json' \
  --data "$PAYLOAD" \
  http://127.0.0.1:4711/hook/stop || true  # never fail CC
