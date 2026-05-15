#!/usr/bin/env bash
# End-to-end demo. Run from the repo root:
#   bash scripts/demo.sh
#
# Assumes:
#   - npm install + npm run build done
#   - data/deals.sqlite exists (run `groupon-intel ingest` or load the
#     committed sample, see README quick-start)
#   - .env populated with an OpenAI-compatible OPENAI_API_KEY

set -e
cd "$(dirname "$0")/.."

CLI="node dist/cli/index.js"

header() {
  printf "\n\033[1;36m== %s ==\033[0m\n" "$1"
}

header "1. Doctor — verify the install"
$CLI doctor

header "2. Catalogue discovery"
$CLI categories
$CLI locations

header "3. Semantic search: 'masaje relajante en pareja'"
$CLI search "masaje relajante en pareja" --limit 5

header "4. Semantic search with filters: 'spa' in Madrid"
$CLI search "spa" --location madrid --limit 3

header "5. Single-deal lookup (uses the top result of the previous query)"
TOP_ID=$($CLI search "spa madrid" --limit 1 -f json | python3 -c "import json,sys; print(json.load(sys.stdin)['results'][0]['id'])" 2>/dev/null || echo "")
if [ -n "$TOP_ID" ]; then
  $CLI deal "$TOP_ID"
fi

header "6. Merchant-side market analysis: belleza × madrid"
$CLI analyze -c belleza -l madrid

header "7. Cross-location category insights: belleza"
$CLI category belleza | head -60

echo
printf "\033[1;32mDemo finished.\033[0m  To talk to the same engine over MCP, point Claude Desktop at scripts/claude-desktop-config.json.\n"
