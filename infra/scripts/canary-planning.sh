#!/bin/bash
# canary-planning.sh — Daily dead-man's switch for the auto-planning pipeline.
#
# Creates a throwaway initiative, waits 5 minutes, then asserts that it
# moved past IDEA/PLANNING into PLANNED (or is at least producing tasks).
# On failure, alerts Owner with the exact stage where the pipeline stalled
# so the next break surfaces within a day instead of next-time-someone-
# submits-an-idea.
#
# Runs daily 08:30 UTC (after secrets-audit at 07:00):
#   30 8 * * * /opt/docker/scripts/cron-wrapper.sh canary-planning /opt/docker/scripts/canary-planning.sh

set -euo pipefail

VS_URL="https://vibe-studio.example.com"
INTERNAL_SECRET="$(grep '^INTERNAL_API_SECRET=' /opt/docker/secrets/.vs.env | cut -d= -f2- || true)"
ALERTER="/opt/docker/scripts/send-tg-alert.sh"
PG_QUERY="docker exec pg psql -U vs -d vs -tAc"

if [ -z "$INTERNAL_SECRET" ]; then
  "$ALERTER" "[canary-planning] INTERNAL_API_SECRET missing — cannot run canary" || true
  exit 2
fi

OWNER_ID="$($PG_QUERY "SELECT id FROM \"User\" WHERE email='owner@example.com' LIMIT 1" | head -1 | tr -d '[:space:]')"
if [ -z "$OWNER_ID" ]; then
  "$ALERTER" "[canary-planning] owner user row not found in VS DB" || true
  exit 2
fi

MARKER="canary-$(date -u +%Y%m%d-%H%M)"
RAW_IDEA="CANARY health check $MARKER — auto-generated, ignore. Safe to close."

# Create initiative directly in DB (bypasses web UI which needs session).
# head -1: psql -tAc returns "uuid\nINSERT 0 1" — take only the first line.
INIT_ID="$($PG_QUERY "
  INSERT INTO \"Initiative\" (id, title, \"rawIdea\", status, \"userId\", \"updatedAt\")
  VALUES (gen_random_uuid()::text, '$MARKER', '$RAW_IDEA', 'IDEA', '$OWNER_ID', now())
  RETURNING id
" | head -1 | tr -d '[:space:]')"

if [ -z "$INIT_ID" ]; then
  "$ALERTER" "[canary-planning] failed to INSERT canary initiative" || true
  exit 2
fi

# Guaranteed cleanup: remove canary row even on early exit or signal.
cleanup() {
  $PG_QUERY "DELETE FROM \"InitiativeMessage\" WHERE \"initiativeId\"='$INIT_ID'" >/dev/null 2>&1 || true
  $PG_QUERY "DELETE FROM \"Task\" WHERE \"initiativeId\"='$INIT_ID'" >/dev/null 2>&1 || true
  $PG_QUERY "DELETE FROM \"Initiative\" WHERE id='$INIT_ID'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Trigger planning via API (goes through auth-gated endpoint).
curl -sf -X POST "${VS_URL}/api/initiatives/${INIT_ID}/plan" \
  -H "x-internal-secret: ${INTERNAL_SECRET}" >/dev/null || {
  "$ALERTER" "[canary-planning] POST /plan failed for ${INIT_ID}" || true
  $PG_QUERY "DELETE FROM \"Initiative\" WHERE id='$INIT_ID'" >/dev/null
  exit 1
}

# Wait up to 8 minutes (cleanup-planning revert threshold is 10 min).
for i in 1 2 3 4 5 6 7 8; do
  sleep 60
  STATUS="$($PG_QUERY "SELECT status FROM \"Initiative\" WHERE id='$INIT_ID'" | tr -d '[:space:]')"
  if [ "$STATUS" = "PLANNED" ] || [ "$STATUS" = "DONE" ]; then
    break
  fi
done

TASKS="$($PG_QUERY "SELECT COUNT(*) FROM \"Task\" WHERE \"initiativeId\"='$INIT_ID'" | tr -d '[:space:]')"
STATUS="$($PG_QUERY "SELECT status FROM \"Initiative\" WHERE id='$INIT_ID'" | tr -d '[:space:]')"

# Cleanup is handled by trap cleanup EXIT — runs automatically on any exit path.

if [ "$STATUS" = "PLANNED" ] || [ "$STATUS" = "DONE" ]; then
  echo "[canary-planning] OK — status=$STATUS tasks=$TASKS"
  exit 0
fi

MSG="[canary-planning] FAIL — auto-planning pipeline stuck.
  Canary:  $MARKER (id=$INIT_ID)
  Status:  $STATUS (expected PLANNED)
  Tasks:   $TASKS (expected ≥1)

Check:
  1. /var/log/syslog  | grep poll-planning
  2. tmux attach -t claude   — is VPS Claude alive?
  3. /opt/docker/secrets/.vs.env  — is INTERNAL_API_SECRET set?"
"$ALERTER" "$MSG" || true
exit 1
