#!/usr/bin/env bash
# flag-missing-tokens.sh — Query DONE tasks that have no tokensUsed field
# Usage: bash infra/scripts/flag-missing-tokens.sh
# Can run locally on VPS or via ssh vps

set -euo pipefail

QUERY='SELECT
  "ticketId",
  LEFT(title, 60) AS title,
  "agentId",
  "completedAt"::date AS completed
FROM "Task"
WHERE status = '\''DONE'\''
  AND ("tokensUsed" IS NULL OR "tokensUsed" = 0)
ORDER BY "completedAt" DESC NULLS LAST
LIMIT 50;'

SUMMARY='SELECT
  COUNT(*) FILTER (WHERE status = '\''DONE'\'') AS total_done,
  COUNT(*) FILTER (WHERE status = '\''DONE'\'' AND "tokensUsed" IS NOT NULL AND "tokensUsed" > 0) AS with_tokens,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = '\''DONE'\'' AND "tokensUsed" IS NOT NULL AND "tokensUsed" > 0)
    / NULLIF(COUNT(*) FILTER (WHERE status = '\''DONE'\''), 0),
    2
  ) AS coverage_pct
FROM "Task";'

echo "=== Token Tracking Coverage ==="
if command -v docker &>/dev/null && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^pg$'; then
  # Running directly on VPS
  docker exec pg psql -U vs -d vs -c "$SUMMARY"
  echo ""
  echo "=== DONE tasks without tokensUsed (latest 50) ==="
  docker exec pg psql -U vs -d vs -c "$QUERY"
else
  # Running remotely via SSH
  ssh vps "docker exec pg psql -U vs -d vs -c \"$SUMMARY\""
  echo ""
  echo "=== DONE tasks without tokensUsed (latest 50) ==="
  ssh vps "docker exec pg psql -U vs -d vs -c \"$QUERY\""
fi
