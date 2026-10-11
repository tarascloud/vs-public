#!/usr/bin/env bash
# backup-offsite.sh — encrypt SQL backups with age, then rsync to NAS
# Wrapped by cron-wrapper.sh for Telegram alerting on failure.
#
# Usage:
#   /opt/docker/scripts/cron-wrapper.sh backup-offsite /opt/docker/scripts/backup-offsite.sh
#
# NAS path: /volume1/Backups/vps/
# NAS user: terminal-user, key: /home/owner/.ssh/nas
# IdentitiesOnly=yes prevents SSH from trying other keys (would trigger autoblock)
#
# 2026-09-02: the glob list below missed three whole classes of backup, which
# therefore never left the host: up_storage_*.tar.gz (737 MB/day),
# date_uploads_*.tar.gz, and the pre-deploy dumps that deploy.sh writes as
# <db>_pre_deploy_<ts>.sql.gz / date_predeploy_<ts>.sql.gz (underscores — the
# "pre-deploy-*" glob never matched them). 72 files / 11.9 GB were offsite-less
# when VPS filled up. Keep this list in sync with the names deploy scripts use.
#
# REV-20260512-023: encrypt .sql.gz files with age before rsync to NAS.
# Plain .sql.gz files are NOT uploaded — only .sql.gz.age encrypted copies.
# Encrypted copies are written to a staging dir (/opt/docker/backups/enc-staging/)
# and cleaned up after rsync. MemPalace backups (*.tar.gz.age) are already
# encrypted by mempalace-backup.sh and are included as-is.
#
# Retention on NAS:
#   - Regular backups (*_backup_*.sql.gz.age): 30 days
#   - Pre-deploy snapshots (pre-deploy-*.sql.gz.age): 30 days
#   - MemPalace backups (mempalace_*.tar.gz.age): managed by mempalace-backup.sh (90 days)

set -euo pipefail

NAS_USER="terminal-user"
NAS_HOST="10.0.0.20"
NAS_DEST="/volume1/Backups/vps"
NAS_KEY="/home/owner/.ssh/nas"
LOCAL_SRC="/opt/docker/backups/"
STAGING_DIR="/opt/docker/backups/enc-staging"
AGE_RECIPIENTS="/opt/docker/secrets/age-recipients.txt"
NAS_KEEP_DAYS=30

SSH_OPTS="-i ${NAS_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=30"

echo "[backup-offsite] Starting at $(date -u '+%Y-%m-%d %H:%M UTC')"

if [ ! -f "$AGE_RECIPIENTS" ]; then
    echo "[backup-offsite] ERROR: age recipients file not found: ${AGE_RECIPIENTS}"
    exit 1
fi

# ── Step 1: encrypt .sql.gz files into staging dir ──────────────────────────
mkdir -p "$STAGING_DIR"
# Clean stale staging files from previous runs
find "$STAGING_DIR" -name "*.age" -mmin +180 -delete 2>/dev/null || true

SQL_ENCRYPTED=0
SQL_SKIPPED=0

for f in "${LOCAL_SRC}"*_backup_*.sql.gz \
         "${LOCAL_SRC}"pre-deploy-*.sql.gz \
         "${LOCAL_SRC}"*_pre_deploy_*.sql.gz \
         "${LOCAL_SRC}"*_predeploy_*.sql.gz \
         "${LOCAL_SRC}"up_storage_*.tar.gz \
         "${LOCAL_SRC}"date_uploads_*.tar.gz; do
    [ -f "$f" ] || continue
    BASE=$(basename "$f")
    ENC_FILE="${STAGING_DIR}/${BASE}.age"
    if [ -f "$ENC_FILE" ] && [ "$ENC_FILE" -nt "$f" ]; then
        # Already encrypted and newer than source — skip re-encryption
        ((SQL_SKIPPED++)) || true
        continue
    fi
    age --encrypt -R "$AGE_RECIPIENTS" -o "$ENC_FILE" "$f"
    ((SQL_ENCRYPTED++)) || true
done

echo "[backup-offsite] Encrypted: ${SQL_ENCRYPTED} new, ${SQL_SKIPPED} already up-to-date"

# ── Step 2: rsync staging (encrypted SQL) + already-encrypted MemPalace backups ─
echo "[backup-offsite] Source (encrypted SQL): ${STAGING_DIR}/"
echo "[backup-offsite] Dest: ${NAS_USER}@${NAS_HOST}:${NAS_DEST}"

# Sync encrypted SQL backups
rsync -av --no-perms --rsync-path=/usr/bin/rsync \
  -e "ssh ${SSH_OPTS}" \
  "${STAGING_DIR}/" \
  "${NAS_USER}@${NAS_HOST}:${NAS_DEST}/"

# Sync MemPalace age-encrypted backups (already encrypted by mempalace-backup.sh)
rsync -av --no-perms --rsync-path=/usr/bin/rsync \
  --include="mempalace_*.tar.gz.age" --exclude="*" \
  -e "ssh ${SSH_OPTS}" \
  "${LOCAL_SRC}" \
  "${NAS_USER}@${NAS_HOST}:${NAS_DEST}/"

# ── Step 3: rotate NAS backups older than NAS_KEEP_DAYS ─────────────────────
echo "[backup-offsite] Cleaning NAS backups older than ${NAS_KEEP_DAYS} days..."
ssh ${SSH_OPTS} \
  "${NAS_USER}@${NAS_HOST}" \
  "find ${NAS_DEST} -maxdepth 1 -name '*_backup_*.sql.gz.age' -mtime +${NAS_KEEP_DAYS} -delete -print && \
   find ${NAS_DEST} -maxdepth 1 -name 'pre-deploy-*.sql.gz.age' -mtime +${NAS_KEEP_DAYS} -delete -print && \
   find ${NAS_DEST} -maxdepth 1 -name '*_pre_deploy_*.sql.gz.age' -mtime +${NAS_KEEP_DAYS} -delete -print && \
   find ${NAS_DEST} -maxdepth 1 -name '*_predeploy_*.sql.gz.age' -mtime +${NAS_KEEP_DAYS} -delete -print && \
   find ${NAS_DEST} -maxdepth 1 -name 'up_storage_*.tar.gz.age' -mtime +${NAS_KEEP_DAYS} -delete -print && \
   find ${NAS_DEST} -maxdepth 1 -name 'date_uploads_*.tar.gz.age' -mtime +${NAS_KEEP_DAYS} -delete -print"

echo "[backup-offsite] Done at $(date -u '+%Y-%m-%d %H:%M UTC')"
