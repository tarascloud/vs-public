#!/usr/bin/env bash
# scrub-secrets-sync.sh
# Sync Infisical-rendered .env files into /opt/docker/mempalace/scrub-secrets/
# Triggered by systemd path unit on IN_CLOSE_WRITE of /opt/docker/secrets/*.env
# Restarts mempalace containers ONLY if .mempalace.env actually changed.
#
# Security: destination files are 0400 owner:owner
# Placement: /opt/docker/scripts/scrub-secrets-sync.sh (symlink from infra/scripts/)

set -euo pipefail

SRC_DIR="/opt/docker/secrets"
DST_DIR="/opt/docker/mempalace/scrub-secrets"
LOG_TAG="scrub-secrets-sync"

ENVS=(
  .mempalace.env
  .pd-prod.env
  .pd-dev.env
  .jobfinder.env
  .sh.env
  .shuleansky.env
  .website.env
  .cloudflare.env
  .status.env
  .vs.env
  .infisical.env
)

# Helper: sha256 of a file (empty string if missing)
sha256_of() {
  if [[ -f "$1" ]]; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo ""
  fi
}

MEMPALACE_ENV_CHANGED=false

for envfile in "${ENVS[@]}"; do
  src="${SRC_DIR}/${envfile}"
  dst="${DST_DIR}/${envfile}"

  # Skip if source doesn't exist
  if [[ ! -f "$src" ]]; then
    logger -t "$LOG_TAG" "SKIP: $src not found"
    continue
  fi

  src_hash=$(sha256_of "$src")
  dst_hash=$(sha256_of "$dst")

  if [[ "$src_hash" == "$dst_hash" ]]; then
    logger -t "$LOG_TAG" "UNCHANGED: $envfile"
    continue
  fi

  logger -t "$LOG_TAG" "UPDATING: $envfile (src=$src_hash dst=$dst_hash)"

  # Copy to temp first, then atomic move
  tmpfile=$(mktemp "${DST_DIR}/.${envfile}.tmp.XXXXXX")
  cp "$src" "$tmpfile"
  chmod 0400 "$tmpfile"
  chown owner:owner "$tmpfile"
  mv "$tmpfile" "$dst"

  logger -t "$LOG_TAG" "DONE: $envfile updated"

  if [[ "$envfile" == ".mempalace.env" ]]; then
    MEMPALACE_ENV_CHANGED=true
  fi
done

# Restart mempalace containers only if .mempalace.env changed.
# Use `docker restart` directly — mempalace-sse may not be defined in
# docker-compose.yml (standalone container) so docker compose restart
# would fail on it.
if [[ "$MEMPALACE_ENV_CHANGED" == "true" ]]; then
  logger -t "$LOG_TAG" "mempalace.env changed — restarting mempalace containers"
  for ctr in mempalace mempalace-sse; do
    if /usr/bin/docker ps --format '{{.Names}}' | grep -qx "$ctr"; then
      /usr/bin/docker restart "$ctr" 2>&1 | logger -t "$LOG_TAG"
      logger -t "$LOG_TAG" "restarted: $ctr"
    else
      logger -t "$LOG_TAG" "container not running, skip restart: $ctr"
    fi
  done
  logger -t "$LOG_TAG" "mempalace restart complete"
fi
