#!/bin/bash
set -euo pipefail

# MemPalace stats updater — refreshes CLAUDE.md live counts block
# Runs daily at 05:00 UTC (after nightly ingest at 04:45)
# Updates /opt/repos/vibe-studio/CLAUDE.md between markers:
#   <!-- MEMPALACE_STATS_START -->  ... <!-- MEMPALACE_STATS_END -->
# Commits + pushes on change so Mac pulls up-to-date stats.
#
# Task: MP-IMPROVE-20260411-14

LOG_FILE="/opt/docker/backups/mempalace-stats-update.log"
REPO_DIR="/opt/repos/vibe-studio"
CLAUDE_MD="${REPO_DIR}/CLAUDE.md"
MARKER_START="<!-- MEMPALACE_STATS_START -->"
MARKER_END="<!-- MEMPALACE_STATS_END -->"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"
}

log "Starting MemPalace stats update"

# 1. Collect live stats from MemPalace pg (ChromaDB decommissioned 2026-04-11;
#    storage migrated to pg database `mempalace`, table `drawers`).
#    Sentinel __meta__ rooms excluded from the user-facing room count.
STATS_JSON=$(docker exec -i pg psql -U mempalace -d mempalace -tAX -c \
  "SELECT json_build_object(
     'wings', COUNT(DISTINCT wing),
     'rooms', COUNT(DISTINCT room) FILTER (WHERE room <> '__meta__'),
     'drawers', COUNT(*)
   ) FROM drawers;")

if [ -z "$STATS_JSON" ]; then
  log "ERROR: empty stats from MemPalace pg"
  exit 1
fi

WINGS=$(echo "$STATS_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['wings'])")
ROOMS=$(echo "$STATS_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['rooms'])")
DRAWERS=$(echo "$STATS_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['drawers'])")

log "Live stats: wings=$WINGS rooms=$ROOMS drawers=$DRAWERS"

# Sanity check — if drawers collapsed to near-zero, abort (avoid committing broken state)
if [ "$DRAWERS" -lt 100 ] || [ "$WINGS" -lt 1 ]; then
  log "ERROR: stats sanity check failed (drawers=$DRAWERS wings=$WINGS)"
  exit 1
fi

BLOCK_NEW="Палац: ${WINGS} wings / ${ROOMS} rooms / ${DRAWERS} drawers (оновлюється щодня автоматично о 05:00 UTC)."

if [ ! -f "$CLAUDE_MD" ]; then
  log "ERROR: $CLAUDE_MD not found"
  exit 1
fi

if ! grep -qF "$MARKER_START" "$CLAUDE_MD"; then
  log "ERROR: marker $MARKER_START not found in $CLAUDE_MD — nothing to update"
  exit 1
fi

# 2. Replace block between markers
python3 - "$CLAUDE_MD" "$MARKER_START" "$MARKER_END" "$BLOCK_NEW" <<'PY'
import sys, re
path, start, end, block = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(path, "r", encoding="utf-8") as f:
    src = f.read()
pattern = re.compile(
    re.escape(start) + r".*?" + re.escape(end),
    re.DOTALL,
)
replacement = f"{start}\n{block}\n{end}"
new = pattern.sub(replacement, src, count=1)
if new == src:
    print("no-change")
else:
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)
    print("updated")
PY

# 3. Note: /opt/repos/vibe-studio/CLAUDE.md is NOT in git — it is synced
# Mac<->VPS via scp in the "байбай" workflow. Stats block is rewritten
# in-place on VPS; Mac picks it up on next baybay sync.
log "Done (wings=$WINGS rooms=$ROOMS drawers=$DRAWERS)"
