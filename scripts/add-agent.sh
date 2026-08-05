#!/usr/bin/env bash
# add-agent.sh — semi-automated onboarding for new VS agent
# Usage: ./scripts/add-agent.sh <name> <role>
# Example: ./scripts/add-agent.sh legal "Legal — contracts, GDPR compliance"
#
# What it does:
# 1. Creates agents/<name>.md prompt skeleton
# 2. Copies wiki template to agents/<name>/wiki/
# 3. Substitutes <agent-name> placeholder
# 4. Inserts row into VS DB Agent table (via SSH to vps)
# 5. Reminds to manually: update roster, create welcome initiative, telegram announce, commit
#
# NOT automated (requires judgment):
# - roster update (collaboration matrix entries)
# - welcome initiative with per-agent tasks
# - CLAUDE.md update
# - Telegram announcement

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <name> <role-description>"
  echo "Example: $0 legal 'Legal — contracts, GDPR compliance'"
  exit 1
fi

NAME="$1"
ROLE="$2"
VS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$VS_ROOT/agents/$NAME.md" ]]; then
  echo "ERROR: agents/$NAME.md already exists"
  exit 1
fi

if [[ -d "$VS_ROOT/agents/$NAME" ]]; then
  echo "ERROR: agents/$NAME/ already exists"
  exit 1
fi

echo "==> Creating prompt skeleton: agents/$NAME.md"
cat > "$VS_ROOT/agents/$NAME.md" <<PROMPT
---
name: $NAME
description: "$ROLE"
subagent_type: $NAME
model: sonnet
tools: [Read, Write, Edit, Grep, Glob, Bash]
---

# $NAME — $ROLE

## Role
<TODO: fill in detailed role description>

## Tools
<TODO: list which tools and when>

## Instructions

### Before any work (Wiki reading)
1. Read \`agents/$NAME/wiki/index.md\` — the map of your memory
2. Read \`agents/$NAME/wiki/log.md\` (tail ~20) — what happened recently
3. Read 3-5 relevant entity/concept pages

### During work
- Capture insights in scratch (update the wiki after finishing, not during)
- Check consistency with known-good / known-bad in relevant pages

### After work
1. Append to \`log.md\`: type + title + refs + 2-3 lines of detail
2. Update relevant entity/concept pages
3. If a new page was created, update \`index.md\`
4. Commit to vs-private alongside other changes

## Projects
<TODO: specify which projects (PD, JF, VS, SH, etc.)>
PROMPT

echo "==> Copying wiki template to agents/$NAME/wiki/"
cp -r "$VS_ROOT/docs/agent-wiki-template" "$VS_ROOT/agents/$NAME/wiki"

echo "==> Substituting placeholder <agent-name> → $NAME"
# macOS sed vs GNU sed
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi
find "$VS_ROOT/agents/$NAME/wiki" -type f -name "*.md" -exec sed "${SED_INPLACE[@]}" "s/<agent-name>/$NAME/g" {} \;

echo "==> Inserting Agent row in VS DB (via ssh vps)"
if command -v ssh >/dev/null 2>&1; then
  ssh -o ConnectTimeout=5 vps "docker exec pg psql -U vs -d vs -c \"INSERT INTO \\\"Agent\\\" (id, name) VALUES (gen_random_uuid()::text, '$NAME') ON CONFLICT (name) DO NOTHING;\"" || \
    echo "WARN: Could not reach vps. Insert manually: INSERT INTO Agent (id, name) VALUES (gen_random_uuid()::text, '$NAME');"
fi

echo ""
echo "==============================================================="
echo "Agent '$NAME' scaffolded. MANUAL STEPS REMAINING:"
echo "==============================================================="
echo ""
echo "1. Edit agents/$NAME.md — fill in <TODO> sections"
echo "2. Edit docs/agents-roster.md — add row in Active table + collaboration matrix"
echo "3. Create Welcome VS initiative with per-agent tasks (48h SLA)"
echo "   — each existing agent reads new README + logs new-peer entry"
echo "4. Update CLAUDE.md if agent list is referenced"
echo "5. Post in @yourbot: 'New agent $NAME has joined'"
echo "6. git add & commit on release-\$(date +%Y-%m-%d) branch"
echo ""
echo "Full checklist: docs/new-agent-checklist.md"
