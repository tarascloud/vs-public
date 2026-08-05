#!/usr/bin/env bash
# Spawn multiple subagents in isolated git worktrees
#
# Usage:
#   spawn-parallel-agents.sh <tickets.yaml>
#   spawn-parallel-agents.sh --tickets "MP-FIX-01:developer,MP-FIX-02:tester"
#
# Output: lines з env vars для кожного worktree:
#   WORKTREE=/tmp/agent-MP-FIX-01-12345 BRANCH=release-20260411-mp-fix-01 TICKET=MP-FIX-01 AGENT=developer
#
# Далі parent orchestrator (COO) читає output і спавнить Claude subagents з cwd=$WORKTREE.
#
# Цей скрипт НЕ спавнить самих Claude агентів — він тільки готує worktrees.
# Спавн відбувається через Agent tool у parent Claude session (COO).

set -euo pipefail

BASE_REPO="${BASE_REPO:-/opt/repos/vibe-studio}"
DATE_TAG="$(date +%Y%m%d)"

usage() {
  cat <<EOF
Usage:
  $0 <tickets.yaml>
  $0 --tickets "TICKET1:agent1,TICKET2:agent2"

Env:
  BASE_REPO   base repo path (default: /opt/repos/vibe-studio)

Examples:
  $0 --tickets "MP-FIX-20260411-01:developer,MP-FIX-20260411-02:tester"

YAML format:
  tasks:
    - ticket: MP-FIX-20260411-01
      agent: developer
      prompt: /tmp/prompt-1.md
    - ticket: MP-FIX-20260411-02
      agent: tester
      prompt: /tmp/prompt-2.md
EOF
  exit 1
}

if [ $# -lt 1 ]; then usage; fi

cd "$BASE_REPO"
git fetch origin main >&2

spawn_one() {
  local ticket="$1"
  local agent="$2"
  local ticket_lower
  ticket_lower=$(echo "$ticket" | tr '[:upper:]' '[:lower:]')
  local branch="release-${DATE_TAG}-${ticket_lower}"
  local worktree="/tmp/agent-${ticket}-$$-${RANDOM}"

  # Якщо гілка вже існує — checkout без -b
  if git show-ref --verify --quiet "refs/heads/${branch}"; then
    git worktree add "$worktree" "$branch" >&2
  else
    git worktree add -b "$branch" "$worktree" origin/main >&2
  fi

  echo "WORKTREE=${worktree} BRANCH=${branch} TICKET=${ticket} AGENT=${agent}"
}

if [ "$1" = "--tickets" ]; then
  IFS=',' read -ra PAIRS <<< "$2"
  for pair in "${PAIRS[@]}"; do
    ticket="${pair%%:*}"
    agent="${pair##*:}"
    spawn_one "$ticket" "$agent"
  done
  exit 0
fi

# YAML path
YAML_FILE="$1"
if [ ! -f "$YAML_FILE" ]; then
  echo "ERROR: YAML file not found: $YAML_FILE" >&2
  exit 1
fi

# Parse YAML via python (yaml stdlib not avail — use PyYAML якщо є, інакше fallback)
python3 - "$YAML_FILE" <<'PY'
import sys
try:
    import yaml
except ImportError:
    print("ERROR: PyYAML not installed (pip install pyyaml)", file=sys.stderr)
    sys.exit(1)

spec = yaml.safe_load(open(sys.argv[1]))
for task in spec.get('tasks', []):
    ticket = task['ticket']
    agent = task.get('agent', 'developer')
    print(f"{ticket}:{agent}")
PY

# Re-run ourselves with --tickets from YAML output
TICKETS=$(python3 - "$YAML_FILE" <<'PY'
import sys, yaml
spec = yaml.safe_load(open(sys.argv[1]))
pairs = [f"{t['ticket']}:{t.get('agent','developer')}" for t in spec.get('tasks', [])]
print(','.join(pairs))
PY
)

IFS=',' read -ra PAIRS <<< "$TICKETS"
for pair in "${PAIRS[@]}"; do
  ticket="${pair%%:*}"
  agent="${pair##*:}"
  spawn_one "$ticket" "$agent"
done
