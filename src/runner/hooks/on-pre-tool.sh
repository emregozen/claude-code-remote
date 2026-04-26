#!/usr/bin/env bash
# PreToolUse hook — ask the runner if this tool call is approved.
# CC pipes a JSON payload on stdin; we POST it and block until the runner responds.
# Exit 0 = allow, exit 2 = block.
set -euo pipefail
PAYLOAD=$(cat)
RESPONSE=$(curl --max-time 70 -s -X POST \
  -H 'Content-Type: application/json' \
  --data "$PAYLOAD" \
  http://127.0.0.1:4711/hook/permission 2>/dev/null || echo '{"approved":false}')

echo "$RESPONSE" | grep -q '"approved":true' && exit 0 || exit 2
