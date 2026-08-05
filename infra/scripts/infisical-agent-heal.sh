#!/bin/bash
# infisical-agent self-heal — REV22 followup (recurring token max-TTL renew loop).
#
# The infisical-agent machine-identity access token expires at its max-TTL and the
# agent gets stuck renewing the dead token (401 "No identity access token found")
# instead of re-authenticating with its client credentials. A container restart
# forces a fresh universal-auth login. Observed 3x in ~16h (2026-06-24, 07-23, 07-24).
#
# This script detects the 401 loop signature in recent logs and restarts the agent.
# Run from cron every ~5min via cron-wrapper so a failed restart alerts.
#
# Proper long-term fix (owner): raise the identity access-token max-TTL in Infisical
# UI so it stops expiring, or fix the agent to re-login on renew failure.
set -euo pipefail

CONTAINER="infisical-agent"
SIGNATURE="No identity access token found"
# Look back slightly further than the cron interval to avoid missing a burst.
WINDOW="6m"
# Require a few hits so a single transient blip does not trigger a restart.
THRESHOLD=3

hits=$(docker logs "$CONTAINER" --since "$WINDOW" 2>&1 | grep -c "$SIGNATURE" || true)

if [[ "$hits" -ge "$THRESHOLD" ]]; then
  echo "[$(date -u +%FT%TZ)] infisical-agent 401 loop detected ($hits hits/$WINDOW) — restarting"
  docker restart "$CONTAINER" >/dev/null
  sleep 8
  # Confirm recovery: templates should render again after fresh auth.
  rendered=$(docker logs "$CONTAINER" --since 12s 2>&1 | grep -c "has been rendered" || true)
  if [[ "$rendered" -ge 1 ]]; then
    echo "[$(date -u +%FT%TZ)] recovered — $rendered templates rendered"
    exit 0
  fi
  echo "[$(date -u +%FT%TZ)] RESTART DID NOT RECOVER — $rendered templates rendered; manual attention needed"
  exit 1
fi

# No loop — nothing to do.
exit 0
