#!/usr/bin/env bash
# MemPalace: sync Mac Claude Code sessions to VPS staging dir (REV-2026-05-03-31 / AI-20260610-0001).
# Nightly ingest on VPS (04:45 UTC) reads /home/owner/.claude/projects/_mac/
# via CLAUDE_EXTRA_PROJECTS_DIR. Without this sync Mac-side sessions never
# reach MemPalace. Runs daily at 03:30 Europe/Madrid via launchd
# (cloud.owner.mempalace-sessions-sync) — 01:30/02:30 UTC, well before ingest.
#
# Install on Mac:
#   cp infra/scripts/mempalace-mac-sessions-sync.sh ~/.local/bin/mempalace-sessions-sync.sh
#   chmod +x ~/.local/bin/mempalace-sessions-sync.sh
#   launchctl load ~/Library/LaunchAgents/cloud.owner.mempalace-sessions-sync.plist
set -euo pipefail

SRC="/Users/owner/.claude/projects/"
DEST="vps:/home/owner/.claude/projects/_mac/"
LOG="$HOME/Library/Logs/mempalace-sessions-sync.log"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] sync start" >> "$LOG"
if rsync -azu --delete --stats -e "ssh -o BatchMode=yes -o ConnectTimeout=15" \
    "$SRC" "$DEST" >> "$LOG" 2>&1; then
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] sync OK" >> "$LOG"
else
  rc=$?
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] sync FAILED rc=$rc" >> "$LOG"
  exit "$rc"
fi

# Keep log under ~1MB
if [ "$(stat -f%z "$LOG" 2>/dev/null || echo 0)" -gt 1048576 ]; then
  tail -c 524288 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
