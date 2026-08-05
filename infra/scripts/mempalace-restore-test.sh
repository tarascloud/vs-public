#!/bin/bash
set -euo pipefail

# MemPalace restore drill v2 — post-pgvector migration (MP-MONO-06)
# Runs weekly on Monday at 05:00 UTC
# Does NOT touch production — verifies backup integrity via pg_restore to throwaway DB
#
# After MP-ARCH-C-07 cutover: backups contain pg_dump (custom format) not chroma.sqlite3.

BACKUP_DIR="/opt/docker/backups"
AGE_KEY="/opt/docker/secrets/age-key.txt"
LOG_FILE="/opt/docker/backups/mempalace-backup.log"
PG_CONTAINER="pg"
PG_SUPERUSER="postgres"
DRILL_DB="mempalace_drill_$(date +%s)"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [restore-test] $1" | tee -a "$LOG_FILE"
}

send_telegram_alert() {
    local msg="$1"
    local token="${TELEGRAM_BOT_TOKEN:-}"
    local chat="${TELEGRAM_CHAT_ID:-100000000}"
    if [ -n "$token" ]; then
        curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
            -d "chat_id=${chat}" \
            -d "text=${msg}" > /dev/null 2>&1 || true
    fi
}

cleanup_drill_db() {
    docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres \
        -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null 2>&1 || true
}
trap cleanup_drill_db EXIT

log "=== MemPalace restore drill v2 started ==="

LATEST_BACKUP=$(find "${BACKUP_DIR}" -name "mempalace_*.tar.gz.age" | sort | tail -1)

if [ -z "${LATEST_BACKUP}" ]; then
    log "FAIL: No encrypted backup files found in ${BACKUP_DIR}"
    send_telegram_alert "[MemPalace] restore drill FAIL: no backup files found"
    exit 1
fi

log "Latest backup: ${LATEST_BACKUP} ($(du -h "${LATEST_BACKUP}" | cut -f1))"

if [ ! -f "$AGE_KEY" ]; then
    MSG="[MemPalace] restore drill FAIL: age private key missing at ${AGE_KEY}"
    log "FAIL: Age private key not found at ${AGE_KEY}"
    send_telegram_alert "$MSG"
    exit 2
fi

SCRATCH=$(mktemp -d /tmp/mempalace-restore-drill-XXXXXX)
trap "rm -rf '${SCRATCH}'; cleanup_drill_db" EXIT

log "Using scratch dir: ${SCRATCH}"

# Step 1: Decrypt + extract
log "Decrypting ${LATEST_BACKUP}..."
if ! age --decrypt -i "$AGE_KEY" "${LATEST_BACKUP}" | tar -xzf - -C "${SCRATCH}" 2>>"$LOG_FILE"; then
    log "FAIL: Decrypt or extract failed for ${LATEST_BACKUP}"
    send_telegram_alert "[MemPalace] restore drill FAIL: decrypt/extract error"
    exit 3
fi
log "Decrypt + extract OK"

# Step 2: Verify mempalace.dump exists
if [ ! -f "${SCRATCH}/mempalace.dump" ]; then
    log "FAIL: mempalace.dump missing from backup (expected after MP-MONO-06)"
    send_telegram_alert "[MemPalace] restore drill FAIL: mempalace.dump missing"
    exit 3
fi

DUMP_SIZE=$(du -h "${SCRATCH}/mempalace.dump" | cut -f1)
log "Found mempalace.dump: ${DUMP_SIZE}"

# Step 3: Verify auxiliary dirs (warn only)
if [ ! -d "${SCRATCH}/ingest-state" ]; then
    log "WARN: ingest-state/ missing from backup (dedup state may be lost on restore)"
fi
if [ ! -d "${SCRATCH}/scrub-secrets" ]; then
    log "WARN: scrub-secrets/ missing from backup"
fi

# Step 4: Create throwaway DB and restore via pg_restore
log "Creating throwaway DB: ${DRILL_DB}"
docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres \
    -c "CREATE DATABASE \"$DRILL_DB\" WITH OWNER postgres;" >> "$LOG_FILE" 2>&1

log "Creating pgvector extension in drill DB..."
docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$DRILL_DB" \
    -c "CREATE EXTENSION IF NOT EXISTS vector;" >> "$LOG_FILE" 2>&1

# Copy dump into pg container (docker cp to read from scratch)
docker cp "${SCRATCH}/mempalace.dump" "${PG_CONTAINER}:/tmp/restore-drill.dump" >> "$LOG_FILE" 2>&1

log "Running pg_restore into drill DB..."
if ! docker exec "$PG_CONTAINER" pg_restore \
    -U "$PG_SUPERUSER" -d "$DRILL_DB" \
    --no-owner --no-acl --clean --if-exists \
    /tmp/restore-drill.dump >> "$LOG_FILE" 2>&1; then
    # pg_restore may emit warnings on --clean for fresh DB; retry without --clean
    docker exec "$PG_CONTAINER" pg_restore \
        -U "$PG_SUPERUSER" -d "$DRILL_DB" \
        --no-owner --no-acl \
        /tmp/restore-drill.dump >> "$LOG_FILE" 2>&1 || true
fi
docker exec "$PG_CONTAINER" rm -f /tmp/restore-drill.dump 2>/dev/null || true

# Step 5: Verify drawer row count (structural check)
# Note: kg_entities/kg_triples dropped in MP-ARCH-FUTURE-03 (2026-04-11).
DRAWERS_COUNT=$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$DRILL_DB" \
    -tAc "SELECT COUNT(*) FROM drawers;" 2>/dev/null || echo "0")

DRAWERS_COUNT=$(echo "$DRAWERS_COUNT" | tr -d ' ')
if [ "$DRAWERS_COUNT" -le 100 ]; then
    log "FAIL: Only ${DRAWERS_COUNT} drawers in restored DB, expected >100"
    send_telegram_alert "[MemPalace] restore drill FAIL: only ${DRAWERS_COUNT} drawers"
    exit 4
fi

# Step 6: Sample drawer query — verify vector column intact
SAMPLE=$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$DRILL_DB" \
    -tAc "SELECT wing, room, LENGTH(content) FROM drawers LIMIT 1;" 2>/dev/null || echo "")
if [ -z "$SAMPLE" ]; then
    log "FAIL: Could not query restored drawers"
    send_telegram_alert "[MemPalace] restore drill FAIL: query failed"
    exit 5
fi

# Step 6b: Verify vector column dimension is intact (detects silent embedding corruption)
VEC_DIM=$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$DRILL_DB" \
    -tAc "SELECT vector_dims(embedding) FROM drawers LIMIT 1;" 2>/dev/null | tr -d ' ')
if [ "$VEC_DIM" != "768" ]; then
    log "FAIL: embedding vector_dims=${VEC_DIM}, expected 768"
    send_telegram_alert "[MemPalace] restore drill FAIL: vector dim ${VEC_DIM} != 768"
    exit 6
fi

# Step 7 (MP-ARCH-FUTURE-04): eval queries against restored DB.
# Row-count alone can't catch silent content/tsvector corruption. We run three
# ts_rank queries — each exercises the content_tsv GENERATED column + GIN index
# and must return at least one hit. If the tsvector is corrupted or content is
# truncated, these queries go to zero while row count stays put.
#
# We use the 'simple' tsquery config deliberately — it works regardless of
# whether the restored backup uses simple-only (pre-MP-C-08-TSVCONFIG) or the
# english+simple hybrid (post-migration), so the drill is schema-version-agnostic.
#
# Lexical-only (ts_rank) was chosen over dense (cosine) because the throwaway
# DB isn't behind the mempalace app, so we cannot call Ollama to embed the
# probe query. ts_rank runs in-pg with zero network dependencies.
run_eval_query() {
    local label="$1"
    local config="$2"
    local probe="$3"
    local min_hits="$4"
    local hits
    hits=$(docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d "$DRILL_DB" \
        -tAc "SELECT COUNT(*) FROM drawers WHERE content_tsv @@ plainto_tsquery('${config}', '${probe}');" \
        2>/dev/null | tr -d ' ')
    hits=${hits:-0}
    if ! [[ "$hits" =~ ^[0-9]+$ ]] || [ "$hits" -lt "$min_hits" ]; then
        log "FAIL: eval query '${label}' returned ${hits} hits (expected >= ${min_hits})"
        send_telegram_alert "[MemPalace] restore drill FAIL: eval '${label}' hits=${hits}"
        exit 7
    fi
    log "eval '${label}' (${config}/'${probe}') -> ${hits} hits OK"
}

run_eval_query "security"  "simple"  "security"  10
run_eval_query "mempalace" "simple"  "mempalace" 10
run_eval_query "claude"    "simple"  "claude"    10

log "RESTORE OK: ${DRAWERS_COUNT} drawers, 3/3 eval queries passed, vector_dims=${VEC_DIM}"
log "Sample: ${SAMPLE}"
log "=== MemPalace restore drill v2 PASSED — throwaway DB dropped ==="
send_telegram_alert "[MemPalace] restore drill OK: ${DRAWERS_COUNT} drawers, eval 3/3, vec=${VEC_DIM}"
# DEV-20260507-0040: write JSON result for status monitoring
printf '{"status":"pass","drawers":%s,"vec_dim":%s,"eval_passed":3,"backup_file":"%s","ran_at":"%s"}
' "$DRAWERS_COUNT" "$VEC_DIM" "$LATEST_BACKUP" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > /opt/docker/backups/restore-drill-result.json
echo "OK: ${DRAWERS_COUNT} drawers, eval 3/3"
