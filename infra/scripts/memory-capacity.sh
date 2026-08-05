#!/usr/bin/env bash
# memory-capacity.sh — Show MEMORY.md capacity usage and file inventory
# Usage: bash memory-capacity.sh [MEMORY_DIR]
# Default: /home/owner/.claude/projects/-opt-repos-vibe-studio/memory/
#
# Exit codes:
#   0 — OK (<80%)
#   1 — Error (missing dir/file)
#   2 — Warning (>=80% capacity)

set -euo pipefail

MAX_LINES=200
WARN_THRESHOLD=80

MEMORY_DIR="${1:-/home/owner/.claude/projects/-opt-repos-vibe-studio/memory/}"
MEMORY_FILE="${MEMORY_DIR}/MEMORY.md"

# --- Validation ---
if [[ ! -d "$MEMORY_DIR" ]]; then
  echo "ERROR: Memory directory not found: $MEMORY_DIR" >&2
  exit 1
fi

if [[ ! -f "$MEMORY_FILE" ]]; then
  echo "ERROR: MEMORY.md not found: $MEMORY_FILE" >&2
  exit 1
fi

# --- Count lines ---
LINES_USED=$(wc -l < "$MEMORY_FILE")
PERCENT=$(( LINES_USED * 100 / MAX_LINES ))

# --- Count memory files (exclude MEMORY.md itself) ---
FILE_COUNT=0
FEEDBACK_COUNT=0
PROJECT_COUNT=0
REFERENCE_COUNT=0
OTHER_COUNT=0

declare -A FILE_TYPES

while IFS= read -r -d '' filepath; do
  basename_f=$(basename "$filepath")
  [[ "$basename_f" == "MEMORY.md" ]] && continue
  FILE_COUNT=$((FILE_COUNT + 1))

  # Extract type from frontmatter
  file_type="unknown"
  if head -1 "$filepath" | grep -q '^---$'; then
    file_type=$(awk '/^---$/{n++; next} n==1 && /^type:/{print $2; exit}' "$filepath")
    file_type="${file_type:-unknown}"
  fi

  FILE_TYPES["$basename_f"]="$file_type"

  case "$file_type" in
    feedback)  FEEDBACK_COUNT=$((FEEDBACK_COUNT + 1)) ;;
    project)   PROJECT_COUNT=$((PROJECT_COUNT + 1)) ;;
    reference) REFERENCE_COUNT=$((REFERENCE_COUNT + 1)) ;;
    *)         OTHER_COUNT=$((OTHER_COUNT + 1)) ;;
  esac
done < <(find "$MEMORY_DIR" -maxdepth 1 -name '*.md' -print0)

# --- Output ---
echo "=== MEMORY.md Capacity Report ==="
echo ""
echo "Directory: $MEMORY_DIR"
echo "Lines used: ${LINES_USED} / ${MAX_LINES} (${PERCENT}%)"
echo ""

# Progress bar
BAR_WIDTH=40
FILLED=$(( PERCENT * BAR_WIDTH / 100 ))
if (( FILLED > BAR_WIDTH )); then FILLED=$BAR_WIDTH; fi
EMPTY=$(( BAR_WIDTH - FILLED ))
BAR_STR=""
for (( b=0; b<FILLED; b++ )); do BAR_STR+="#"; done
for (( b=0; b<EMPTY; b++ )); do BAR_STR+="-"; done
echo "[${BAR_STR}] ${PERCENT}%"
echo ""

echo "Memory files: ${FILE_COUNT}"
echo "  feedback:  ${FEEDBACK_COUNT}"
echo "  project:   ${PROJECT_COUNT}"
echo "  reference: ${REFERENCE_COUNT}"
echo "  other:     ${OTHER_COUNT}"
echo ""

# --- File details ---
echo "--- File Inventory ---"
printf "%-45s %-12s %s\n" "FILE" "TYPE" "MODIFIED"
printf "%-45s %-12s %s\n" "----" "----" "--------"

while IFS= read -r -d '' filepath; do
  basename_f=$(basename "$filepath")
  [[ "$basename_f" == "MEMORY.md" ]] && continue

  file_type="${FILE_TYPES[$basename_f]:-unknown}"
  mod_date=$(date -d "@$(stat -c '%Y' "$filepath" 2>/dev/null || echo 0)" '+%Y-%m-%d' 2>/dev/null || echo "unknown")
  days_ago=$(( ( $(date +%s) - $(stat -c '%Y' "$filepath" 2>/dev/null || echo 0) ) / 86400 ))

  printf "%-45s %-12s %s (%dd ago)\n" "$basename_f" "$file_type" "$mod_date" "$days_ago"
done < <(find "$MEMORY_DIR" -maxdepth 1 -name '*.md' -print0 | sort -z)

echo ""

# --- Warnings ---
EXIT_CODE=0

if (( PERCENT >= WARN_THRESHOLD )); then
  echo "WARNING: MEMORY.md is at ${PERCENT}% capacity (>= ${WARN_THRESHOLD}%)"
  echo ""
  echo "Suggested actions:"
  echo "  1. Run: bash infra/scripts/memory-consolidate.sh $MEMORY_DIR"
  echo "  2. Review stale project memories (>60 days without update)"
  echo "  3. Merge similar feedback entries"
  echo ""
  EXIT_CODE=2
else
  echo "Status: OK (${PERCENT}% < ${WARN_THRESHOLD}% threshold)"
fi

exit $EXIT_CODE
