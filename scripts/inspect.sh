#!/usr/bin/env bash
# Launch the MCP Inspector against the local server.
#
# Requirements: `npm run build` first.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f dist/mcp/server.js ]; then
  echo "Build the server first: npm run build" >&2
  exit 1
fi

exec npx -y @modelcontextprotocol/inspector node dist/mcp/server.js
