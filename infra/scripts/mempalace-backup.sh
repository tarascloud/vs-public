#!/bin/bash
set -euo pipefail

# MemPalace backup script v2 — unified pg_dump + ingest-state (MP-MONO-06)
# Runs daily at 04:00 UTC (after PG backup at 03:00)
# Backups: /opt/docker/backups/mempalace_YYYYMMDD_HHMMSS.tar.gz.age
# Retention: 7 days on-host, 90 days on NAS
#
# Content after pgvector migration (MP-ARCH-C-05/C-07):
# - pg_dump of mempalace database (wings, rooms, drawers + embeddings, kg_entities, kg_triples)
# - ingest-state/ (dedup state files, critical for incremental ingestion)
# - scrub-secrets/ (scrubber secret index, needed for content filtering)
# - audit.log (file-based, historical — will move to pg in future ticket)
# - legacy-sqlite-archive-* (if exists, 30-day rollback window from C-07)

BACKUP_DIR="/opt/docker/backups"
PALACE_DIR="/opt/docker/mempalace"
AGE_RECIPIENTS="/opt/docker/secrets/age-recipients.txt"
NAS_USER="terminal-user"
NAS_HOST="10.0.0.20"
NAS_BACKUP_DIR="/volume1/Backups/mempalace"
LOG_FILE="/opt/docker/backups/mempalace-backup.log"
KEEP_LOCAL_DAYS=7
KEEP_NAS_DAYS=90
MAX_SIZE_MB=200

# pg dump target (reads from same env the mempalace container uses)
PG_CONTAINER="pg"
PG_DB="mempalace"
PG_USER="mempalace"
PG_PASSWORD_FILE="/opt/docker/secrets/.mempalace.env"

NAS_KEY="/home/owner/.ssh/nas"
SSH_NAS="ssh -i ${NAS_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/mempalace_${DATE}.tar.gz"
BACKUP_ENC="${BACKUP_FILE}.age"
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

# DEV-20260610-0061: log() prints to stdout ONLY. The cron entry already
# redirects stdout/stderr to $LOG_FILE; tee -a here duplicated every line.
# When running interactively, redirect manually if a log file is needed.
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "=== MemPalace backup v2 started (${DATE}) ==="

# Read pg password from .mempalace.env
if [ ! -f "$PG_PASSWORD_FILE" ]; then
    log "ERROR: $PG_PASSWORD_FILE not found"
    exit 1
fi
PG_PASSWORD=$(grep '^MEMPALACE_DB_PASSWORD=' "$PG_PASSWORD_FILE" | cut -d= -f2- | tr -d '"')
if [ -z "$PG_PASSWORD" ]; then
    log "ERROR: MEMPALACE_DB_PASSWORD not found in $PG_PASSWORD_FILE"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

if [ ! -d "${PALACE_DIR}" ]; then
    log "ERROR: ${PALACE_DIR} does not exist. Aborting."
    exit 1
fi

# ── Step 1: pg_dump mempalace DB ─────────────────────────────────────────────
log "Running pg_dump mempalace → ${WORK_DIR}/mempalace.sql"
docker exec -e PGPASSWORD="$PG_PASSWORD" "$PG_CONTAINER" \
    pg_dump -U "$PG_USER" -d "$PG_DB" \
    --no-owner --no-acl --format=custom \
    > "${WORK_DIR}/mempalace.dump"

DUMP_SIZE=$(du -sh "${WORK_DIR}/mempalace.dump" | cut -f1)
log "pg_dump complete: ${DUMP_SIZE}"

# Basic sanity check — dump should have non-trivial size
DUMP_BYTES=$(stat -c%s "${WORK_DIR}/mempalace.dump")
if [ "$DUMP_BYTES" -lt 1000 ]; then
    log "ERROR: pg_dump too small (${DUMP_BYTES} bytes). Aborting."
    exit 2
fi

# ── Step 2: Tar ingest-state + scrub-secrets + audit.log + dump ─────────────
log "Tarring ingest-state + scrub-secrets + audit.log + pg dump"

# Build tar: include the pg dump + ingest-state + scrub-secrets + audit.log
# (audit.log is file-based history; ingest-state is dedup; scrub-secrets is content filter)
tar -czf "$BACKUP_FILE" \
    -C "$WORK_DIR" mempalace.dump \
    -C "$PALACE_DIR" \
    $( [ -d "${PALACE_DIR}/ingest-state" ] && echo "ingest-state" ) \
    $( [ -d "${PALACE_DIR}/scrub-secrets" ] && echo "scrub-secrets" ) \
    $( [ -f "${PALACE_DIR}/palace/audit.log" ] && echo "palace/audit.log" ) \
    2>&1 || true

if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: tar did not create $BACKUP_FILE"
    exit 3
fi

# DEV-20260507-0029: Measure component sizes AFTER tar (from tar listing)
# rather than before, so we record what actually got packed. Empty audit.log
# is silently masked otherwise.
TAR_LISTING=$(tar -tzvf "$BACKUP_FILE")

# tar -tzv lines: -rw-r--r-- user/group SIZE date time path
get_packed_size() {
    # Args: 1=path inside tar
    echo "$TAR_LISTING" | awk -v p="$1" '$NF == p {print $3; exit}' | head -1
}

DUMP_PACKED=$(get_packed_size "mempalace.dump")
STATE_PACKED=$(echo "$TAR_LISTING" | awk '$NF ~ /^ingest-state\// {sum+=$3} END {print sum+0}')
SCRUB_PACKED=$(echo "$TAR_LISTING" | awk '$NF ~ /^scrub-secrets\// {sum+=$3} END {print sum+0}')
AUDIT_PACKED=$(get_packed_size "palace/audit.log")
AUDIT_PACKED=${AUDIT_PACKED:-0}

log "packed contents (post-tar): pg-dump=${DUMP_PACKED}bytes ingest-state=${STATE_PACKED}bytes scrub-secrets=${SCRUB_PACKED}bytes audit.log=${AUDIT_PACKED}bytes"

# DEV-20260507-0029 + REV-20260512-001: assert audit.log integrity.
# Empty audit.log can be a real regression (logging broken / wrong path / container
# can't write) OR a legitimate post-rotation state: logrotate at 00:00 UTC rotates
# audit.log → audit.log-YYYYMMDD, sidecar reopens, new audit.log is 0 bytes until
# first POST. Nightly ingest at 04:45 UTC is AFTER backup at 04:00 UTC, so the
# 4-hour window between rotation and first ingest is a legitimate 0-byte state.
# Rule: accept iff source exists AND (source size == 0 OR packed size == source size).
AUDIT_SRC="${PALACE_DIR}/palace/audit.log"
if [ ! -f "$AUDIT_SRC" ]; then
    log "ERROR: audit.log source missing at ${AUDIT_SRC} — refusing to ship."
    rm -f "$BACKUP_FILE"
    exit 5
fi
AUDIT_SRC_SIZE=$(stat -c%s "$AUDIT_SRC")
if [ "$AUDIT_SRC_SIZE" -eq 0 ]; then
    log "WARN: audit.log source is 0 bytes (likely post-logrotate before first POST). Shipping empty audit.log."
elif [ "${AUDIT_PACKED:-0}" -eq 0 ]; then
    log "ERROR: audit.log source is ${AUDIT_SRC_SIZE} bytes but tar packed 0 — refusing to ship potentially-broken backup."
    rm -f "$BACKUP_FILE"
    exit 5
fi

TAR_SIZE_MB=$(du -m "$BACKUP_FILE" | cut -f1)
log "Tar complete: ${TAR_SIZE_MB}M"

if [ "$TAR_SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
    log "WARN: backup size ${TAR_SIZE_MB}M > alert threshold ${MAX_SIZE_MB}M"
fi

# ── Step 3: age-encrypt ─────────────────────────────────────────────────────
log "Encrypting with age..."
if [ ! -f "$AGE_RECIPIENTS" ]; then
    log "ERROR: age recipients file $AGE_RECIPIENTS not found"
    exit 4
fi
age --encrypt -R "$AGE_RECIPIENTS" -o "$BACKUP_ENC" "$BACKUP_FILE"
ENC_SIZE=$(du -h "$BACKUP_ENC" | cut -f1)
log "Encrypted: ${ENC_SIZE}"
rm -f "$BACKUP_FILE"

# ── Step 4: NAS upload ──────────────────────────────────────────────────────
# REV-20260512-048: use explicit NAS key + IdentitiesOnly=yes to prevent
# SSH from trying other keys which triggers Synology autoblock after 10 fails.
log "Uploading to NAS ${NAS_HOST}:${NAS_BACKUP_DIR}..."
NAS_FILE="${NAS_BACKUP_DIR}/$(basename "$BACKUP_ENC")"
if cat "$BACKUP_ENC" | ${SSH_NAS} "${NAS_USER}@${NAS_HOST}" \
    "mkdir -p '${NAS_BACKUP_DIR}' && cat > '${NAS_FILE}'"; then
    log "NAS upload OK: ${NAS_FILE}"
else
    log "WARN: NAS upload FAILED (backup still on host, retry next cycle)"
fi

# ── Step 5: rotate on-host ──────────────────────────────────────────────────
log "Rotating on-host backups (keep ${KEEP_LOCAL_DAYS} days)..."
find "$BACKUP_DIR" -maxdepth 1 -name 'mempalace_*.tar.gz.age' -mtime +${KEEP_LOCAL_DAYS} -delete
REMAINING=$(find "$BACKUP_DIR" -maxdepth 1 -name 'mempalace_*.tar.gz.age' | wc -l)
log "On-host backups remaining: ${REMAINING}"

# ── Step 6: rotate NAS ──────────────────────────────────────────────────────
log "Rotating NAS backups (keep ${KEEP_NAS_DAYS} days)..."
${SSH_NAS} "${NAS_USER}@${NAS_HOST}" \
    "find '${NAS_BACKUP_DIR}' -maxdepth 1 -name 'mempalace_*.tar.gz.age' -mtime +${KEEP_NAS_DAYS} -delete" \
    2>/dev/null || log "WARN: NAS rotation failed"

log "=== MemPalace backup v2 complete: ${BACKUP_ENC} ==="
