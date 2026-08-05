#!/bin/bash
# check-pg-ip.sh — Verify that the hardcoded pg IP in docker-compose.yml
# matches the actual running pg container IP. Auto-heals on mismatch.
#
# Background: status container runs in network_mode:host and cannot use
# Docker DNS; it has extra_hosts: pg:<IP> hardcoded in compose (line ~239).
# If pg is recreated its Docker IP shifts, breaking status→pg connectivity silently.
#
# Auto-heal flow:
#   1. Detect mismatch
#   2. sed-replace old IP with new IP in compose file (in-place)
#   3. docker compose up -d --force-recreate status
#   4. Verify status container is healthy (pg_isready via status /api/status)
#   5. Send Telegram: "healed OK" or "heal FAILED after 2 attempts"
#   6. Only alert as BLOCKED if both attempts fail
#
# Usage: run via cron every 15 min (via cron-wrapper.sh for TG alerts on crash)
# Exit 0 = OK or healed, Exit 1 = mismatch not healed after 2 attempts, Exit 2 = error

set -euo pipefail

COMPOSE_FILE="/opt/docker/docker-compose.yml"
COMPOSE_DIR="/opt/docker"
SEND_TG="/opt/docker/scripts/send-tg-alert.sh"
MAX_HEAL_ATTEMPTS=2

# Extract hardcoded IP from the unique extra_hosts entry for pg
# Line format:   - "pg:172.18.0.11"
HARDCODED_IP="$(grep -E '^\s+- "pg:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"' "$COMPOSE_FILE" | sed 's/.*"pg:\([0-9.]*\)".*/\1/' | head -1)"

if [ -z "$HARDCODED_IP" ]; then
  echo "ERROR: Could not parse pg IP from $COMPOSE_FILE" >&2
  exit 2
fi

# Get actual pg container IP (first non-empty IP across all networks)
ACTUAL_IP="$(docker inspect pg --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -v '^$' | head -1)"

if [ -z "$ACTUAL_IP" ]; then
  echo "ERROR: Could not inspect pg container (not running?)" >&2
  "$SEND_TG" "check-pg-ip: pg container is not running or inspect failed. Status connectivity may be broken." || true
  exit 2
fi

echo "Hardcoded IP: $HARDCODED_IP | Actual IP: $ACTUAL_IP"

if [ "$HARDCODED_IP" = "$ACTUAL_IP" ]; then
  echo "OK: pg IP matches ($ACTUAL_IP)"
  exit 0
fi

# --- MISMATCH DETECTED — attempt auto-heal ---
echo "MISMATCH: compose has $HARDCODED_IP, actual is $ACTUAL_IP. Starting auto-heal..."

heal_attempt() {
  local attempt=$1
  echo "Auto-heal attempt $attempt/$MAX_HEAL_ATTEMPTS..."

  # Step 1: sed-replace hardcoded IP in compose file (in-place, unique pg extra_hosts line)
  sed -i "s/\"pg:${HARDCODED_IP}\"/\"pg:${ACTUAL_IP}\"/" "$COMPOSE_FILE"

  # Verify the replacement took
  local NEW_IP
  NEW_IP="$(grep -E '^\s+- "pg:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"' "$COMPOSE_FILE" | sed 's/.*"pg:\([0-9.]*\)".*/\1/' | head -1)"
  if [ "$NEW_IP" != "$ACTUAL_IP" ]; then
    echo "ERROR: sed replacement failed, compose still shows $NEW_IP" >&2
    return 1
  fi
  echo "Compose updated: pg:${HARDCODED_IP} -> pg:${ACTUAL_IP}"

  # Step 2: recreate status container to pick up new extra_hosts
  cd "$COMPOSE_DIR"
  docker compose up -d --force-recreate status
  echo "status container recreated"

  # Step 3: wait up to 30s for status to become healthy
  local retries=6
  local healthy=0
  while [ $retries -gt 0 ]; do
    sleep 5
    STATUS_HEALTH="$(docker inspect status --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")"
    echo "status health: $STATUS_HEALTH (retries left: $retries)"
    if [ "$STATUS_HEALTH" = "healthy" ]; then
      healthy=1
      break
    fi
    retries=$((retries - 1))
  done

  if [ $healthy -eq 1 ]; then
    return 0
  else
    echo "status container did not become healthy within 30s" >&2
    return 1
  fi
}

HEAL_OK=0
for attempt in $(seq 1 $MAX_HEAL_ATTEMPTS); do
  if heal_attempt "$attempt"; then
    HEAL_OK=1
    break
  fi
  echo "Attempt $attempt failed, waiting 10s before retry..."
  sleep 10
done

if [ $HEAL_OK -eq 1 ]; then
  MSG="check-pg-ip: AUTO-HEALED pg IP mismatch.
Old compose IP: ${HARDCODED_IP}
New actual IP:  ${ACTUAL_IP}
status container recreated and healthy."
  echo "$MSG"
  "$SEND_TG" "$MSG" || true
  exit 0
else
  MSG="check-pg-ip: HEAL FAILED after ${MAX_HEAL_ATTEMPTS} attempts!
compose extra_hosts: pg:${HARDCODED_IP}
actual pg IP:        ${ACTUAL_IP}

Status container likely cannot reach pg. MANUAL INTERVENTION REQUIRED:
1. ssh vps
2. sed -i 's/pg:${HARDCODED_IP}/pg:${ACTUAL_IP}/' /opt/docker/docker-compose.yml
3. cd /opt/docker && docker compose up -d --force-recreate status"

  echo "$MSG" >&2
  "$SEND_TG" "$MSG" || true
  exit 1
fi
