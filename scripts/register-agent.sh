#!/usr/bin/env bash
#
# register-agent.sh — onboard a new agent's wiki into MemPalace.
#
# Usage:
#   bash scripts/register-agent.sh <agent_name>
#
# What it does (per MP-WIKI-ONBOARD-01 / ADR §Q10):
#   1. Validates that agents/<agent>/wiki/ exists.
#   2. Runs ingest_agent_wikis.py --only-agent <agent> on VPS so the
#      new agent's entities/concepts/... pages flow into
#      wing_agents/room_<agent> without waiting 24h for nightly.
#   3. Sends a Telegram notification via pd-bot so Owner sees it ran.
#
# Idempotent: safe to re-run. Re-runs embed zero new drawers unless files
# changed (source_id dedup).
#
# Nightly ingest (ingest_agent_wikis.py in nightly.sh) auto-discovers new
# agent directories — this script is for "ingest right now" and for
# sending the onboarding notification. For pure wait-until-tomorrow flows
# this script is optional.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <agent_name>" >&2
    exit 2
fi

AGENT="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"  # 

WIKI_DIR="$REPO_ROOT/agents/$AGENT/wiki"
if [[ ! -d "$WIKI_DIR" ]]; then
    echo "ERROR: agents/$AGENT/wiki missing at $WIKI_DIR" >&2
    echo "       create it from docs/agent-wiki-template/ first" >&2
    exit 1
fi

echo "[register-agent] agent=$AGENT wiki=$WIKI_DIR"

# Run the ingester on VPS (it needs .mempalace.env + running ingest_server).
# If this script runs ON VPS, ssh vps just loops back — that's fine.
INGEST_CMD="cd /opt/repos/vibe-studio/services/mempalace && \
    sudo -E bash -c 'set -a; source /opt/docker/secrets/.mempalace.env; set +a; \
    python3 ingest/ingest_agent_wikis.py --only-agent $AGENT'"

echo "[register-agent] running ingester on vps..."
if command -v ssh >/dev/null 2>&1 && ssh -o BatchMode=yes -o ConnectTimeout=5 vps true 2>/dev/null; then
    ssh vps "$INGEST_CMD"
else
    # Fallback: run locally (we're probably already on VPS)
    bash -c "$INGEST_CMD"
fi

# Telegram notification (best-effort — do not fail the script if missing)
TOKEN=""
if [[ -r /opt/docker/secrets/.pd-bot.env ]]; then
    TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' /opt/docker/secrets/.pd-bot.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
elif ssh -o BatchMode=yes -o ConnectTimeout=5 vps true 2>/dev/null; then
    TOKEN=$(ssh vps "sudo -n grep -E '^TELEGRAM_BOT_TOKEN=' /opt/docker/secrets/.pd-bot.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\"' | tr -d \"'\"") || TOKEN=""
fi

if [[ -n "$TOKEN" ]]; then
    CHAT_ID=100000000
    MSG="New agent ${AGENT} registered — wikis ingested into mempalace (wing_agents/room_${AGENT})."
    curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${CHAT_ID}" \
        --data-urlencode "text=${MSG}" >/dev/null || echo "[register-agent] telegram notify failed (non-fatal)"
    echo "[register-agent] telegram notification sent to chat ${CHAT_ID}"
else
    echo "[register-agent] TELEGRAM_BOT_TOKEN not reachable — skipping notification"
fi

echo "[register-agent] done — agent=$AGENT"
