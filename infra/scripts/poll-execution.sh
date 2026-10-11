#!/bin/bash
# poll-execution.sh — Poll VS for IN_PROGRESS tasks and send to Claude Code
# Runs every 3 minutes via cron on VPS.
# Sends one task at a time to Claude Code tmux session.

set -euo pipefail

VS_URL="https://vibe-studio.example.com"
CRON_SECRET="$(grep '^CRON_SECRET=' /opt/docker/secrets/.vs.env | cut -d= -f2)"
INTERNAL_SECRET="$(grep '^INTERNAL_API_SECRET=' /opt/docker/secrets/.vs.env | cut -d= -f2)"
TMUX_SESSION="claude"
LOG_TAG="poll-execution"

log() { logger -t "$LOG_TAG" "$@"; }

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

# Poll VS for pending tasks
RESPONSE=$(curl -sf "${VS_URL}/api/cron/pending-tasks" \
  -H "x-cron-secret: ${CRON_SECRET}" 2>/dev/null) || {
  log "Failed to reach VS API"
  exit 0
}

COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count',0))" 2>/dev/null)

if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

log "Found $COUNT pending task(s)"

# Build prompt for Claude Code — send one group (initiative) at a time
PROMPT=$(echo "$RESPONSE" | python3 -c "
import sys, json

data = json.load(sys.stdin)
groups = data.get('groups', [])
if not groups:
    sys.exit(0)

# Take first group only
g = groups[0]
init_id = g['initiativeId']
project = g['project']
project_slug = g['projectSlug']
api = g['api']
tasks = g['tasks']

# Map project slug to local path
# sh/shuleansky dropped 2026-09-02: project decommissioned, repo archived on
# GitHub and moved to /opt/repos/vibe-studio/!archive/sh-private.
project_paths = {
    'pd': '/opt/repos/vibe-studio/pd-private',
    'jf': '/opt/repos/vibe-studio/jf-private',
    'vs': '/opt/repos/vibe-studio',
}
project_path = project_paths.get(project_slug, f'/opt/repos/vibe-studio/{project_slug}-private')

task_lines = []
for t in tasks:
    agent_name = t['agent']['name'] if t.get('agent') else 'developer'
    task_lines.append(f\"\"\"- {t['ticketId']}: {t['title']}
  Агент: {agent_name}
  Опис: {t.get('description') or 'немає'}
  Acceptance: {t.get('acceptanceCriteria') or 'немає'}\"\"\")

tasks_text = chr(10).join(task_lines)

prompt = f\"\"\"Виконай задачі для проекту {project} (initiative: {init_id}).

Проект знаходиться в: {project_path}

Задачі:
{tasks_text}

Правила:
1. Для кожної задачі використай відповідного агента (subagent_type) паралельно де можливо.
2. Кожен агент працює в git worktree (isolation: worktree).
3. Після виконання кожної задачі — оновити статус через API:
curl -s -X PUT {api['taskUpdateUrl']}/TASK_ID -H \"Content-Type: application/json\" -H \"x-internal-secret: {api['secret']}\" -d '{{\"status\":\"DONE\",\"completionNote\":\"що було зроблено\",\"verificationStatus\":\"PASS\"}}'
4. Якщо є питання — відправити в initiative messages:
curl -s -X POST {api['messagesUrl']} -H \"Content-Type: application/json\" -H \"x-internal-secret: {api['secret']}\" -d '{{\"content\":\"питання\",\"type\":\"question\",\"fromAgent\":\"agent_name\"}}'
\"\"\"

print(prompt)
" 2>/dev/null)

if [ -z "$PROMPT" ]; then
  log "Failed to build prompt"
  exit 0
fi

log "Sending execution request to Claude Code"
# Write PROMPT to a tmp file and load via tmux load-buffer to avoid
# "command too long" error when PROMPT exceeds tmux send-keys argv limit (~16KB).
PROMPT_FILE=$(mktemp /tmp/poll-exec-prompt-XXXXXX.txt)
printf '%s' "$PROMPT" > "$PROMPT_FILE"
tmux load-buffer -b poll-exec "$PROMPT_FILE"
rm -f "$PROMPT_FILE"
tmux paste-buffer -b poll-exec -t "$TMUX_SESSION"
tmux delete-buffer -b poll-exec 2>/dev/null || true
sleep 2
# Confirm pasted text if Claude Code shows preview
tmux send-keys -t "$TMUX_SESSION" Enter
