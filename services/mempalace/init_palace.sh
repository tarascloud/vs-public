#!/usr/bin/env bash
# init_palace.sh — Bootstrap MemPalace wings + rooms on VPS.
#
# Usage:
#   bash init_palace.sh            # normal run
#   bash init_palace.sh --dry-run  # print what would be created
#
# What it does:
#   1. Checks that the 'mempalace' container is running.
#   2. Copies init_palace.py into the container (or uses pre-baked /app/init_palace.py).
#   3. Runs python /app/init_palace.py inside the container.
#
# Prerequisites:
#   - Docker accessible via current user (or sudo)
#   - mempalace container running (docker compose up -d mempalace)
#
# If the container is not running, see:
#   cd /opt/docker && docker compose up -d mempalace
#
# If .mempalace.env is missing (required by docker-compose):
#   See mp_t04 (Infisical agent setup). Temporary workaround:
#     TOKEN=$(openssl rand -hex 32)
#     echo "MEMPALACE_INGEST_TOKEN=${TOKEN}" > /opt/docker/secrets/.mempalace.env
#     chmod 600 /opt/docker/secrets/.mempalace.env
#   NOTE: This is a temporary dev token. Production token must come from Infisical (mp_t04).

set -euo pipefail

CONTAINER_NAME="mempalace"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_SCRIPT="${SCRIPT_DIR}/init_palace.py"
DRY_RUN_FLAG=""

# Pass through --dry-run if given
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN_FLAG="--dry-run"
fi

# ── 1. Check container is running ─────────────────────────────────────────────
echo "[init_palace] Checking container: ${CONTAINER_NAME}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo ""
    echo "[init_palace] ERROR: container '${CONTAINER_NAME}' is not running."
    echo ""
    echo "To start it:"
    echo "  cd /opt/docker && docker compose up -d mempalace"
    echo ""
    echo "If .mempalace.env is missing:"
    echo "  TOKEN=\$(openssl rand -hex 32)"
    echo "  echo \"MEMPALACE_INGEST_TOKEN=\${TOKEN}\" > /opt/docker/secrets/.mempalace.env"
    echo "  chmod 600 /opt/docker/secrets/.mempalace.env"
    echo "  # Then set this token in Infisical (mp_t04) for permanent rotation."
    echo ""
    exit 1
fi

echo "[init_palace] Container '${CONTAINER_NAME}' is running."

# ── 2. Copy latest init_palace.py into container ──────────────────────────────
# We always copy to ensure we use the current version from repo,
# not a potentially stale /app/init_palace.py baked at build time.
echo "[init_palace] Copying init_palace.py into container..."
docker cp "${INIT_SCRIPT}" "${CONTAINER_NAME}:/tmp/init_palace.py"

# ── 3. Run init ────────────────────────────────────────────────────────────────
echo "[init_palace] Running palace initialization..."
docker exec "${CONTAINER_NAME}" python /tmp/init_palace.py \
    --palace /data/palace \
    ${DRY_RUN_FLAG}

EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
    echo "[init_palace] Done."
else
    echo "[init_palace] FAILED (exit code: ${EXIT_CODE})"
    exit $EXIT_CODE
fi
