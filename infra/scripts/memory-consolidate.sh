#!/usr/bin/env bash
# memory-consolidate.sh — Analyze and consolidate Claude memory files
# Usage: bash memory-consolidate.sh [MEMORY_DIR] [--apply]
#
# Default mode: DRY RUN (shows what would happen)
# --apply: Actually perform consolidation (backup to MemPalace first)
#
# Safety rules:
#   - NEVER auto-deletes feedback memories (only project/reference stale)
#   - Always backs up to MemPalace before any deletion
#   - DRY RUN by default

set -euo pipefail

MEMORY_DIR="${1:-/home/owner/.claude/projects/-opt-repos-vibe-studio/memory/}"
APPLY=false
MEMPALACE_URL="http://127.0.0.1:8031"
MEMPALACE_ENV="/opt/docker/secrets/.mempalace.env"
STALE_DAYS=60

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
  esac
done

# --- Validation ---
if [[ ! -d "$MEMORY_DIR" ]]; then
  echo "ERROR: Memory directory not found: $MEMORY_DIR" >&2
  exit 1
fi

echo "=== Memory Consolidation Report ==="
echo ""
echo "Directory: $MEMORY_DIR"
echo "Mode: $(if $APPLY; then echo 'APPLY (changes will be made)'; else echo 'DRY RUN (no changes)'; fi)"
echo "Stale threshold: ${STALE_DAYS} days"
echo ""

# --- Collect file metadata ---
declare -A FILE_TYPE
declare -A FILE_DESC
declare -A FILE_MTIME
declare -A FILE_DAYS_AGO
declare -a ALL_FILES=()

NOW=$(date +%s)

while IFS= read -r -d '' filepath; do
  basename_f=$(basename "$filepath")
  [[ "$basename_f" == "MEMORY.md" ]] && continue
  ALL_FILES+=("$basename_f")

  # Extract frontmatter
  ftype="unknown"
  fdesc=""
  if head -1 "$filepath" | grep -q '^---$'; then
    ftype=$(awk '/^---$/{n++; next} n==1 && /^type:/{print $2; exit}' "$filepath")
    ftype="${ftype:-unknown}"
    fdesc=$(awk '/^---$/{n++; next} n==1 && /^description:/{$1=""; print substr($0,2); exit}' "$filepath")
  fi

  mtime=$(stat -c '%Y' "$filepath" 2>/dev/null || echo 0)
  days_ago=$(( (NOW - mtime) / 86400 ))

  FILE_TYPE["$basename_f"]="$ftype"
  FILE_DESC["$basename_f"]="$fdesc"
  FILE_MTIME["$basename_f"]="$mtime"
  FILE_DAYS_AGO["$basename_f"]="$days_ago"
done < <(find "$MEMORY_DIR" -maxdepth 1 -name '*.md' -print0)

# --- 1. Find stale candidates (project/reference, >60 days) ---
echo "--- Stale Candidates (>${STALE_DAYS} days, non-feedback) ---"
STALE_COUNT=0
declare -a STALE_FILES=()

for f in "${ALL_FILES[@]}"; do
  ftype="${FILE_TYPE[$f]}"
  days="${FILE_DAYS_AGO[$f]}"

  # Skip feedback — never auto-consolidate
  [[ "$ftype" == "feedback" ]] && continue

  if (( days > STALE_DAYS )); then
    STALE_COUNT=$((STALE_COUNT + 1))
    STALE_FILES+=("$f")
    mod_date=$(date -d "@${FILE_MTIME[$f]}" '+%Y-%m-%d' 2>/dev/null || echo "unknown")
    echo "  STALE: $f (type=$ftype, last modified: $mod_date, ${days}d ago)"
    echo "    desc: ${FILE_DESC[$f]}"
  fi
done

if (( STALE_COUNT == 0 )); then
  echo "  (none found)"
fi
echo ""

# --- 2. Find similar descriptions (potential merge candidates) ---
echo "--- Similar Memories (potential merge candidates) ---"
SIMILAR_COUNT=0

# Simple word-overlap similarity: compare description words
# Group files by prefix (feedback_*, project_*)
declare -A PREFIX_GROUP
for f in "${ALL_FILES[@]}"; do
  prefix="${f%%_*}"
  if [[ -v "PREFIX_GROUP[$prefix]" ]]; then
    PREFIX_GROUP["$prefix"]="${PREFIX_GROUP[$prefix]} $f"
  else
    PREFIX_GROUP["$prefix"]="$f"
  fi
done

# Within each prefix group, check for word overlap in descriptions
for prefix in "${!PREFIX_GROUP[@]}"; do
  read -ra group_files <<< "${PREFIX_GROUP[$prefix]}"
  num=${#group_files[@]}
  (( num < 2 )) && continue

  for (( i=0; i<num; i++ )); do
    for (( j=i+1; j<num; j++ )); do
      f1="${group_files[$i]}"
      f2="${group_files[$j]}"
      desc1="${FILE_DESC[$f1]}"
      desc2="${FILE_DESC[$f2]}"

      # Skip if either description is empty
      [[ -z "$desc1" || -z "$desc2" ]] && continue

      # Count common significant words (>3 chars)
      common=0
      total_words=0
      while IFS= read -r word; do
        (( ${#word} <= 3 )) && continue
        total_words=$((total_words + 1))
        # Case-insensitive match
        if echo "$desc2" | grep -qi "$word" 2>/dev/null; then
          common=$((common + 1))
        fi
      done <<< "$(echo "$desc1" | tr ' ,;:.!?/' '\n')"

      if (( total_words > 0 && common * 100 / total_words >= 50 )); then
        SIMILAR_COUNT=$((SIMILAR_COUNT + 1))
        echo "  SIMILAR ($common/$total_words words overlap):"
        echo "    1: $f1 — ${desc1}"
        echo "    2: $f2 — ${desc2}"
        echo ""
      fi
    done
  done
done

if (( SIMILAR_COUNT == 0 )); then
  echo "  (none found)"
fi
echo ""

# --- 3. Protected entries (feedback — always kept) ---
echo "--- Protected Entries (feedback — never auto-removed) ---"
PROTECTED_COUNT=0
for f in "${ALL_FILES[@]}"; do
  if [[ "${FILE_TYPE[$f]}" == "feedback" ]]; then
    PROTECTED_COUNT=$((PROTECTED_COUNT + 1))
    echo "  KEEP: $f"
  fi
done
echo "  Total protected: ${PROTECTED_COUNT}"
echo ""

# --- 4. Summary ---
echo "--- Summary ---"
echo "Total memory files: ${#ALL_FILES[@]}"
echo "Stale candidates:   ${STALE_COUNT}"
echo "Similar pairs:      ${SIMILAR_COUNT}"
echo "Protected (feedback): ${PROTECTED_COUNT}"
echo ""

# --- 5. Apply actions (if --apply) ---
if (( STALE_COUNT > 0 )); then
  if $APPLY; then
    echo "--- Applying: Archive stale to MemPalace + remove ---"

    # Load MemPalace bearer token
    MEMPALACE_TOKEN=""
    if [[ -f "$MEMPALACE_ENV" ]]; then
      MEMPALACE_TOKEN=$(grep -oP 'MEMPALACE_BEARER_TOKEN=\K.*' "$MEMPALACE_ENV" 2>/dev/null || true)
    fi

    if [[ -z "$MEMPALACE_TOKEN" ]]; then
      echo "ERROR: Cannot load MEMPALACE_BEARER_TOKEN from $MEMPALACE_ENV" >&2
      echo "Aborting --apply to prevent data loss." >&2
      exit 1
    fi

    for f in "${STALE_FILES[@]}"; do
      filepath="${MEMORY_DIR}/${f}"
      content=$(cat "$filepath")
      ftype="${FILE_TYPE[$f]}"
      fdesc="${FILE_DESC[$f]}"

      echo "  Archiving $f to MemPalace..."

      # POST to MemPalace
      HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        -X POST "${MEMPALACE_URL}/ingest/decision" \
        -H "Authorization: Bearer ${MEMPALACE_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
          --arg wing "vs" \
          --arg room "decisions" \
          --arg content "MEMORY CONSOLIDATION ARCHIVE\nFile: $f\nType: $ftype\nDescription: $fdesc\n\n$content" \
          --arg source "memory-consolidation" \
          '{wing: $wing, room: $room, content: $content, source: $source}'
        )" 2>/dev/null || echo "000")

      if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" ]]; then
        echo "    Archived to MemPalace (HTTP $HTTP_CODE)"
        echo "    Removing $f..."
        rm "$filepath"

        # Remove line from MEMORY.md
        # Use grep -v to filter out the line referencing this file
        if grep -q "$f" "${MEMORY_DIR}/MEMORY.md"; then
          grep -v "$f" "${MEMORY_DIR}/MEMORY.md" > "${MEMORY_DIR}/MEMORY.md.tmp"
          mv "${MEMORY_DIR}/MEMORY.md.tmp" "${MEMORY_DIR}/MEMORY.md"
          echo "    Removed from MEMORY.md index"
        fi

        echo "    Done: $f archived and removed"
      else
        echo "    ERROR: MemPalace returned HTTP $HTTP_CODE, skipping removal of $f"
      fi
      echo ""
    done
  else
    echo "--- DRY RUN: No changes made ---"
    echo "To apply changes, run:"
    echo "  bash infra/scripts/memory-consolidate.sh $MEMORY_DIR --apply"
  fi
else
  echo "No stale files to consolidate."
fi

echo ""
echo "Done."
