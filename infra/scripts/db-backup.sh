#!/usr/bin/env bash
# Backup all PostgreSQL databases to /opt/docker/backups
# Databases: pd_prod, pd_dev, jobfinder, vs, infisical, sh, korobkov, bp, status, date
# Runs as a cron job at 03:00 daily and on-demand from VS Controls.
# NOTE: mempalace is intentionally EXCLUDED — it is covered by the dedicated
# age-encrypted v2 backup (mempalace-backup.sh, daily 04:00 UTC + NAS offsite).
# Dumping it here too produced a second, unencrypted ~97MB copy (DEV-20260610-0061).

set -euo pipefail

BACKUP_DIR="/opt/docker/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

# Map: database_name -> pg_user
declare -A DB_USERS=(
  [pd_prod]="pd"
  [pd_dev]="pd"
  [jobfinder]="jobfinder"
  [vs]="vs"
  [infisical]="infisical"
  [sh]="sh"
  [korobkov]="korobkov"
  [bp_prod]="bp"
  [bp_dev]="bp"
  [status]="status_reader"
  [date]="date"
)

SUCCESS=0
FAILED=0

for DB in pd_prod pd_dev jobfinder vs infisical sh korobkov bp_prod bp_dev status date; do
  USER="${DB_USERS[$DB]}"
  FILE="${BACKUP_DIR}/${DB}_backup_${TIMESTAMP}.sql.gz"

  echo "Backing up ${DB} (user: ${USER})..."
  if docker exec pg pg_dump -U "$USER" "$DB" | gzip > "$FILE"; then
    SIZE=$(du -h "$FILE" | cut -f1)
    echo "  OK: ${FILE} (${SIZE})"
    ((SUCCESS++)) || true
  else
    echo "  FAILED: ${DB}"
    rm -f "$FILE"
    ((FAILED++)) || true
  fi
done

# Backup date uploads docker volume (tar archive, retention 14 days)
# NOTE: the real volume is docker_date_uploads (compose project prefix), NOT date_uploads.
# Using the wrong name silently creates an empty volume and produces an 86-byte tar (DEV-20260610-0029).
DATE_UPLOADS_KEEP_DAYS=14
DATE_UPLOADS_MIN_BYTES=1024
DATE_UPLOADS_VOLUME="docker_date_uploads"
DATE_UPLOADS_FILE="${BACKUP_DIR}/date_uploads_${TIMESTAMP}.tar.gz"
echo "Backing up ${DATE_UPLOADS_VOLUME} volume..."
rm -f "$DATE_UPLOADS_FILE"
if docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "${DATE_UPLOADS_VOLUME}:/data:ro" \
    -v "${BACKUP_DIR}:/backup" \
    alpine:3.20 \
    tar czf "/backup/date_uploads_${TIMESTAMP}.tar.gz" -C /data . 2>/dev/null \
    && [[ $(stat -c%s "$DATE_UPLOADS_FILE" 2>/dev/null || echo 0) -ge $DATE_UPLOADS_MIN_BYTES ]]; then
  SIZE=$(du -h "$DATE_UPLOADS_FILE" | cut -f1)
  echo "  OK: ${DATE_UPLOADS_FILE} (${SIZE})"
  ((SUCCESS++)) || true
else
  echo "  FAILED: ${DATE_UPLOADS_VOLUME} volume backup (archive missing or smaller than ${DATE_UPLOADS_MIN_BYTES} bytes)"
  rm -f "$DATE_UPLOADS_FILE"
  ((FAILED++)) || true
fi

# Backup /opt/docker/up-storage (tusd/up-api upload data, bind mount).
# REV22-028: up-storage was not backed up — loss of the host directory = total data loss.
UP_STORAGE_KEEP_DAYS=14
UP_STORAGE_MIN_BYTES=1024
UP_STORAGE_DIR="/opt/docker/up-storage"
UP_STORAGE_FILE="${BACKUP_DIR}/up_storage_${TIMESTAMP}.tar.gz"
echo "Backing up ${UP_STORAGE_DIR}..."
rm -f "$UP_STORAGE_FILE"
if [[ ! -d "$UP_STORAGE_DIR" ]]; then
  echo "  SKIP: ${UP_STORAGE_DIR} does not exist (up service not yet deployed)"
elif [[ -z "$(find "$UP_STORAGE_DIR" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  # Empty upload pool is a valid state (no uploads yet) — still archive it so
  # the monitor sees a fresh file, but never mark it FAILED for being small.
  tar czf "$UP_STORAGE_FILE" -C "$UP_STORAGE_DIR" . 2>/dev/null || true
  echo "  OK (empty): ${UP_STORAGE_FILE}"
  ((SUCCESS++)) || true
elif tar czf "$UP_STORAGE_FILE" -C "$UP_STORAGE_DIR" . 2>/dev/null \
    && [[ $(stat -c%s "$UP_STORAGE_FILE" 2>/dev/null || echo 0) -ge $UP_STORAGE_MIN_BYTES ]]; then
  SIZE=$(du -h "$UP_STORAGE_FILE" | cut -f1)
  echo "  OK: ${UP_STORAGE_FILE} (${SIZE})"
  ((SUCCESS++)) || true
else
  echo "  FAILED: up-storage backup (archive missing or too small)"
  rm -f "$UP_STORAGE_FILE"
  ((FAILED++)) || true
fi

# Remove backups older than KEEP_DAYS days
echo ""
echo "Removing backups older than ${KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "*_backup_*.sql.gz" -mtime +"$KEEP_DAYS" -delete -print

# Remove date_uploads archives older than DATE_UPLOADS_KEEP_DAYS days
echo "Removing date_uploads archives older than ${DATE_UPLOADS_KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "date_uploads_*.tar.gz" -mtime +"$DATE_UPLOADS_KEEP_DAYS" -delete -print

# Remove up_storage archives older than UP_STORAGE_KEEP_DAYS days
echo "Removing up_storage archives older than ${UP_STORAGE_KEEP_DAYS} days..."
find "$BACKUP_DIR" -name "up_storage_*.tar.gz" -mtime +"$UP_STORAGE_KEEP_DAYS" -delete -print

echo ""
echo "Done. Success: ${SUCCESS}, Failed: ${FAILED}"

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
