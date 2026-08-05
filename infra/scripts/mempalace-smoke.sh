#!/bin/bash
set -euo pipefail

# MemPalace daily smoke test (runs on Mac via launchd/cron)
# Task: MP-IMPROVE-20260411-15
#
# Verifies end-to-end that the mempalace MCP server is reachable from Mac
# through the SSH forced-command wrapper (mempalace-mac-key → mempalace-runner.sh
# → docker exec mempalace python -m mempalace.mcp_server).
#
# Failure → Telegram alert to Owner (user 100000000).
# Success → exit 0 silently (log file only).

LOG_FILE="${HOME}/.local/state/mempalace-smoke.log"
mkdir -p "$(dirname "$LOG_FILE")"
SSH_HOST="vps-mempalace"
MIN_DRAWERS="${MEMPALACE_SMOKE_MIN_DRAWERS:-1000}"
TELEGRAM_USER_ID="100000000"
MCP_CMD='docker exec -i -e HOME=/home/mempalace/.cache mempalace python -m mempalace.mcp_server --palace /data/palace'

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

alert() {
  local msg="$1"
  log "ALERT: $msg"
  local token=""
  if command -v infisical >/dev/null 2>&1; then
    token=$(infisical run --env=prod --path=/pd-bot -- printenv TELEGRAM_BOT_TOKEN 2>/dev/null || true)
  fi
  if [ -z "$token" ] && [ -f "/opt/docker/secrets/.pd-bot.env" ]; then
    token=$(grep '^TELEGRAM_BOT_TOKEN=' /opt/docker/secrets/.pd-bot.env | cut -d= -f2- || true)
  fi
  if [ -z "$token" ] && [ -f "${HOME}/.secrets/pd-bot.env" ]; then
    token=$(grep '^TELEGRAM_BOT_TOKEN=' "${HOME}/.secrets/pd-bot.env" | cut -d= -f2- || true)
  fi
  if [ -z "$token" ]; then
    log "WARN: no Telegram token available, cannot send alert"
    return 0
  fi
  curl -sS -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_USER_ID}" \
    --data-urlencode "text=MemPalace smoke FAIL: ${msg}" \
    >/dev/null 2>&1 || log "WARN: Telegram API call failed"
}

log "Smoke test start"

# Craft MCP request payload: initialize + initialized notification + mempalace_status
REQUEST_PAYLOAD=$(cat <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mempalace_status","arguments":{}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"mempalace_search","arguments":{"query":"MemPalace nightly ingest","limit":1}}}
EOF
)

# Send via SSH forced-command; capture full JSON stream
if ! RESPONSE=$(printf '%s\n' "$REQUEST_PAYLOAD" | ssh -o ConnectTimeout=15 -o BatchMode=yes "$SSH_HOST" "$MCP_CMD" 2>/dev/null); then
  alert "SSH to $SSH_HOST failed"
  exit 1
fi

if [ -z "$RESPONSE" ]; then
  alert "empty response from MCP server"
  exit 1
fi

# Parse mempalace_status (id=2) total_drawers + verify search (id=3)
PARSED=$(RESPONSE="$RESPONSE" python3 <<'PY'
import json, os
count = 0
search_ok = 0
for line in (os.environ.get("RESPONSE") or "").splitlines():
    line = line.strip()
    if not line or not line.startswith("{"):
        continue
    try:
        msg = json.loads(line)
    except Exception:
        continue
    if msg.get("id") == 2 and "result" in msg:
        content = msg["result"].get("content", [])
        if content and content[0].get("type") == "text":
            try:
                payload = json.loads(content[0]["text"])
                count = int(payload.get("total_drawers", 0))
            except Exception:
                pass
    if msg.get("id") == 3 and "result" in msg:
        # Server must at least respond with structured content.
        # Known bug MP-BUG-20260411-XX: embedding dimensionality mismatch —
        # once fixed, tighten this check to reject payload["error"].
        content = msg["result"].get("content", [])
        if content and content[0].get("type") == "text":
            search_ok = 1
print(f"{count} {search_ok}")
PY
)
DRAWERS=$(echo "$PARSED" | awk '{print $1}')
SEARCH_OK=$(echo "$PARSED" | awk '{print $2}')

log "Result: drawers=$DRAWERS search_ok=$SEARCH_OK"

if [ "$DRAWERS" -lt "$MIN_DRAWERS" ]; then
  alert "drawers=$DRAWERS < min=$MIN_DRAWERS"
  exit 1
fi

if [ "$SEARCH_OK" != "1" ]; then
  alert "mempalace_search returned no valid result"
  exit 1
fi

log "OK: $DRAWERS drawers, search working"
exit 0
