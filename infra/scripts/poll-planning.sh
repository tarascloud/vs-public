#!/bin/bash
# poll-planning.sh — Poll VS for PLANNING initiatives and send to Claude Code
# Runs every 2 minutes via cron on VPS.
# Checks if Claude Code tmux session is idle before sending.

set -euo pipefail

VS_URL="https://vibe-studio.example.com"
CRON_SECRET="$(grep '^CRON_SECRET=' /opt/docker/secrets/.vs.env | cut -d= -f2 || true)"
INTERNAL_SECRET="$(grep '^INTERNAL_API_SECRET=' /opt/docker/secrets/.vs.env | cut -d= -f2 || true)"
TMUX_SESSION="claude"
LOG_TAG="poll-planning"

log() { logger -t "$LOG_TAG" "$@"; }

# Loud-fail validation: a silent empty INTERNAL_SECRET blocked auto-planning
# for 13 minutes before cleanup cron reverted the Mykhailo→Michael initiative
# to IDEA on 2026-04-19. Exit code 2 surfaces the failure in syslog instead of
# being swallowed by set -e during the grep|cut pipe.
if [ -z "${CRON_SECRET}" ]; then
  log "FATAL: CRON_SECRET missing from /opt/docker/secrets/.vs.env — check Infisical /vs folder"
  exit 2
fi
if [ -z "${INTERNAL_SECRET}" ]; then
  log "FATAL: INTERNAL_API_SECRET missing from /opt/docker/secrets/.vs.env — check Infisical /vs folder"
  exit 2
fi

# Check if tmux session exists
if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
  log "tmux session '$TMUX_SESSION' not found, skipping"
  exit 0
fi

# Check if Claude Code is idle (prompt line is just ❯ with nothing after it)
PANE_CONTENT=$(tmux capture-pane -t "$TMUX_SESSION" -p 2>/dev/null | tail -10)
if ! echo "$PANE_CONTENT" | grep -q '❯'; then
  log "Claude Code is busy, skipping"
  exit 0
fi
# Check prompt is empty (no pasted text waiting)
PROMPT_LINE=$(echo "$PANE_CONTENT" | grep '❯' | head -1)
if echo "$PROMPT_LINE" | grep -q 'Pasted text'; then
  log "Claude Code has pending pasted text, skipping"
  exit 0
fi

# Poll VS for pending plans
RESPONSE=$(curl -sf "${VS_URL}/api/cron/pending-plans" \
  -H "x-cron-secret: ${CRON_SECRET}" 2>/dev/null) || {
  log "Failed to reach VS API"
  exit 0
}

COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null)

if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

log "Found $COUNT pending plan(s)"

# Export RESPONSE so the python heredoc can read it from env.
# Single-quoted heredoc ('PYEOF') prevents bash from interpreting < > ( ) " $
# inside the prompt template — a previous double-quoted python -c "..." block
# broke on "<id агента>" (treated as file redirection) and on inner double
# quotes (prematurely closed the bash string), silently producing garbage.
export RESPONSE
PY_OUTPUT=$(python3 - <<'PYEOF'
import os, json, sys

data = json.loads(os.environ["RESPONSE"])
for plan in data.get("plans", []):
    init_id = plan["id"]
    raw_idea = plan["rawIdea"]
    project = plan["project"]
    author = plan["author"]
    agents = "\n".join(f"- {a}" for a in plan.get("agents", []))
    cb = plan["callbackInstructions"]
    secret = cb["secret"]
    message_url = cb["messageUrl"]
    status_url = cb["statusUrl"]

    prompt = f"""Ти COO агент. Розплануй ініціативу {init_id}.

Ідея: {raw_idea}
Проект: {project}
Автор: {author}

Доступні агенти:
{agents}

ВАЖЛИВО — створюй задачі ТІЛЬКИ через VS API (НЕ через SQL):
curl -s -X POST https://vibe-studio.example.com/api/tasks -H 'Content-Type: application/json' -H 'x-internal-secret: {secret}' -d '{{"title":"...","description":"...","initiativeId":"{init_id}","assigneeType":"AGENT","agentId":"AGENT_ID","priority":5}}'

Для кожної задачі ОБОВ'ЯЗКОВО вказуй agentId з таблиці Agent. Знайди через SQL: SELECT id,name FROM \"Agent\" WHERE \"isActive\"=true.

Останню задачу створи з assigneeType=CLIENT для ревью автором.

Після створення ВСІХ задач — обов'язково виконай ОБА curl:
1. curl -s -X POST {message_url} -H 'Content-Type: application/json' -H 'x-internal-secret: {secret}' -d '{{"content":"План готовий: [список задач]","type":"info","fromAgent":"coo"}}'
2. curl -s -X PUT {status_url} -H 'Content-Type: application/json' -H 'x-internal-secret: {secret}' -d '{{"status":"PLANNED","summary":"короткий підсумок"}}'

Без цих curl задача застрягне в PLANNING назавжди.
"""
    # Flatten newlines so bash-while loop reads one record per initiative.
    sys.stdout.write(f"{init_id}|" + prompt.replace("\n", "\\n") + "\n")
PYEOF
)

echo "$PY_OUTPUT" | while IFS='|' read -r INIT_ID PROMPT; do
  [ -z "$INIT_ID" ] && continue
  log "Sending plan request for initiative $INIT_ID to Claude Code"

  # Re-expand escaped newlines into real newlines for the pasted prompt.
  REAL_PROMPT=$(printf '%b' "$PROMPT")

  tmux send-keys -t "$TMUX_SESSION" "$REAL_PROMPT" Enter
  sleep 2
  # Confirm Claude Code's pasted-text preview, if any.
  tmux send-keys -t "$TMUX_SESSION" Enter

  # One at a time — let Claude Code finish the first before taking the next.
  break
done
