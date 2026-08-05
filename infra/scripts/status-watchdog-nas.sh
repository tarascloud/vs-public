#!/bin/sh
# status-watchdog-nas.sh — dead-man's switch for status.example.com
# DEV-20260610-0045: the status container is the ONLY alert path; if it dies,
# silence. This script runs on the Synology NAS (10.0.0.20) from
# /etc/crontab every 5 minutes and alerts Telegram directly when
# status.example.com/health fails 2 consecutive checks (~10 min), plus sends
# a recovery message when it comes back.
#
# Deploy (Synology: scp does not work — use cat | ssh 'cat > file'):
#   cat infra/scripts/status-watchdog-nas.sh | \
#     ssh terminal-user@10.0.0.20 'cat > /volume1/Backups/status-watchdog/status-watchdog.sh && chmod +x /volume1/Backups/status-watchdog/status-watchdog.sh'
#   Token (NOT in git): printf '%s' "$TG_TOKEN" | ssh ... 'cat > /volume1/Backups/status-watchdog/.tg_token && chmod 600 ...'
#   Crontab line (TAB-separated, /etc/crontab, then: sudo systemctl restart crond):
#     */5 * * * * root /volume1/Backups/status-watchdog/status-watchdog.sh
WATCHDOG_DIR="/volume1/Backups/status-watchdog"
STATE_FILE="$WATCHDOG_DIR/state"      # "<consecutive_fails> <alerted 0|1>"
TOKEN_FILE="$WATCHDOG_DIR/.tg_token"  # bot token, chmod 600, NOT in git
CHAT_ID="100000000"
URL="https://status.example.com/health"

[ -r "$TOKEN_FILE" ] || exit 0  # not configured — do nothing
TG_TOKEN=$(cat "$TOKEN_FILE")

FAILS=0; ALERTED=0
if [ -r "$STATE_FILE" ]; then
  read -r FAILS ALERTED < "$STATE_FILE"
  [ -n "$FAILS" ] || FAILS=0
  [ -n "$ALERTED" ] || ALERTED=0
fi

send_tg() {
  curl -sf -m 20 "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
    --data-urlencode "chat_id=$CHAT_ID" \
    --data-urlencode "text=$1" >/dev/null 2>&1
}

if curl -sf -m 20 "$URL" >/dev/null 2>&1; then
  if [ "$ALERTED" = "1" ]; then
    send_tg "✅ status.example.com RECOVERED (NAS dead-man watchdog)"
  fi
  echo "0 0" > "$STATE_FILE"
else
  FAILS=$((FAILS + 1))
  if [ "$FAILS" -ge 2 ] && [ "$ALERTED" = "0" ]; then
    send_tg "🚨 status.example.com DOWN — $FAILS consecutive failed checks (NAS dead-man watchdog). The monitoring container itself may be dead: ssh vps 'docker logs --tail 50 status'"
    ALERTED=1
  fi
  echo "$FAILS $ALERTED" > "$STATE_FILE"
fi
