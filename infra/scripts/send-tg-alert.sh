#!/bin/bash
# send-tg-alert.sh — Shared helper that sends an alert to Owners Telegram.
#
# Usage:
#   /opt/docker/scripts/send-tg-alert.sh "message body"
#   echo "body" | /opt/docker/scripts/send-tg-alert.sh
#
# Reads TELEGRAM_BOT_TOKEN from /opt/docker/secrets/.infra.env and always
# delivers to chat_id 100000000 (Owner). Silent on success, non-zero exit
# if the HTTP POST fails — callers should not treat an alert failure as
# fatal unless they explicitly check.

set -euo pipefail

CHAT_ID="${TELEGRAM_CHAT_ID:-100000000}"

if [ $# -gt 0 ]; then
  MSG="$*"
else
  MSG="$(cat)"
fi

TOKEN="$(grep '^TELEGRAM_BOT_TOKEN=' /opt/docker/secrets/.infra.env 2>/dev/null | cut -d= -f2- || true)"
if [ -z "$TOKEN" ]; then
  # Fall back to pd-prod.env (same token, different provenance)
  TOKEN="$(grep '^TELEGRAM_BOT_TOKEN=' /opt/docker/secrets/.pd-prod.env 2>/dev/null | cut -d= -f2- || true)"
fi
if [ -z "$TOKEN" ]; then
  logger -t send-tg-alert "TELEGRAM_BOT_TOKEN missing — alert dropped: ${MSG:0:100}"
  exit 1
fi

# Truncate to Telegram's 4096-char limit.
if [ ${#MSG} -gt 4000 ]; then
  MSG="${MSG:0:3990}… [truncated]"
fi

curl -sf -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT_ID}" \
  --data-urlencode "text=${MSG}" \
  -o /dev/null \
  || { logger -t send-tg-alert "Telegram POST failed"; exit 2; }
