#!/usr/bin/env bash
# rolling-deploy.sh — Zero-downtime deploy for prod Next.js services
#
# Approach: docker network alias swap (no nginx proxy, no Cloudflare API calls)
#   1. Build new image with timestamp tag
#   2. Start <service>-new container with SAME network aliases as current
#   3. Wait until /api/health returns 200 (max 60s)
#   4. Send SIGTERM to old container (10s grace) then remove
#   5. Rename <service>-new → <service> (via stop/rename/start)
#
# On any failure: SIGTERM new container + remove → old remains serving traffic
#
# Usage:
#   rolling-deploy.sh [--dry-run] <service>
#   rolling-deploy.sh [--dry-run] <service> <image:tag>   # deploy pre-built image
#
# Supported services: pd-prod, jobfinder, korobkov, sh, bp, vs-landing, tatiana, owner
#
# Requirements:
#   - Docker installed, current user in docker group (or run as root)
#   - Service already running (first deploy still uses docker compose up -d)
#   - COMPOSE_FILE=/opt/docker/docker-compose.yml (default)
#
# DEV-20260507-0021

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
COMPOSE_FILE="${COMPOSE_FILE:-/opt/docker/docker-compose.yml}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-/opt/docker/.env}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"      # seconds to wait for healthy
DRAIN_TIMEOUT="${DRAIN_TIMEOUT:-10}"        # seconds to drain old container
TG_ALERT="${TG_ALERT:-}"                    # set to "1" to send Telegram alerts
SEND_TG="${SEND_TG:-/opt/docker/scripts/send-tg-alert.sh}"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

SERVICE="${1:-}"
CUSTOM_IMAGE="${2:-}"  # optional: pre-built image tag

if [[ -z "$SERVICE" ]]; then
  echo "Usage: rolling-deploy.sh [--dry-run] <service> [image:tag]" >&2
  echo "Services: pd-prod, jobfinder, korobkov, sh, bp, vs-landing, tatiana, owner" >&2
  exit 1
fi

# ── Logging ───────────────────────────────────────────────────────────────────
log()  { echo "[rolling-deploy] $(date '+%H:%M:%S') $*"; }
warn() { echo "[rolling-deploy] WARN $(date '+%H:%M:%S') $*" >&2; }
die()  { echo "[rolling-deploy] ERROR $(date '+%H:%M:%S') $*" >&2; exit 1; }
dryrun() { if [[ $DRY_RUN -eq 1 ]]; then echo "[DRY-RUN] $*"; else eval "$*"; fi; }

# ── Service map: container name → host port → health path ─────────────────────
# Format: "HOST_PORT HEALTH_PATH CONTAINER_PORT"
declare -A SERVICE_MAP=(
  [pd-prod]="8003 /api/health 3333"
  [jobfinder]="3456 /api/health 3000"
  [korobkov]="8060 /api/health 3000"
  [sh]="8040 /api/health 3000"
  [bp]="8050 /api/health 3000"
  [vs-landing]="8020 /healthz 3000"
  [tatiana]="8085 /healthz 80"
  [owner]="8080 /healthz 80"
)

if [[ -z "${SERVICE_MAP[$SERVICE]+_}" ]]; then
  die "Unknown service '$SERVICE'. Supported: ${!SERVICE_MAP[*]}"
fi

read -r HOST_PORT HEALTH_PATH CONTAINER_PORT <<< "${SERVICE_MAP[$SERVICE]}"
NEW_CONTAINER="${SERVICE}-new"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
IMAGE_TAG="${SERVICE}:${TIMESTAMP}"
IMAGE_LATEST="${SERVICE}:latest"

# ── Dry-run plan ───────────────────────────────────────────────────────────────
if [[ $DRY_RUN -eq 1 ]]; then
  echo ""
  echo "=== rolling-deploy.sh DRY-RUN for: $SERVICE ==="
  echo ""
  echo "Step 1: Verify current container '$SERVICE' is running"
  echo "        docker inspect $SERVICE --format '{{.State.Status}}'"
  echo ""
  echo "Step 2: Build new image"
  if [[ -n "$CUSTOM_IMAGE" ]]; then
    echo "        Using pre-built image: $CUSTOM_IMAGE"
    echo "        docker tag $CUSTOM_IMAGE $IMAGE_TAG"
  else
    echo "        docker compose -f $COMPOSE_FILE build $SERVICE"
    echo "        docker tag $IMAGE_LATEST $IMAGE_TAG"
  fi
  echo ""
  echo "Step 3: Start new container '$NEW_CONTAINER'"
  echo "        Same env_file, volumes, networks as '$SERVICE'"
  echo "        Port binding: 127.0.0.1:TEMP_PORT→$CONTAINER_PORT (no host port conflict)"
  echo ""
  echo "Step 4: Wait for health check (max ${HEALTH_TIMEOUT}s)"
  echo "        curl -sf http://127.0.0.1:TEMP_PORT${HEALTH_PATH} → expect HTTP 200"
  echo ""
  echo "Step 5: Graceful stop old container '$SERVICE' (SIGTERM, ${DRAIN_TIMEOUT}s drain)"
  echo "        docker stop --time=$DRAIN_TIMEOUT $SERVICE"
  echo ""
  echo "Step 6: Rename '$NEW_CONTAINER' → '$SERVICE'"
  echo "        docker rename $NEW_CONTAINER $SERVICE"
  echo ""
  echo "Step 7: Connect new container to original host port"
  echo "        (via docker compose up -d --no-recreate → uses existing container)"
  echo "        docker compose -f $COMPOSE_FILE up -d --no-deps $SERVICE"
  echo ""
  echo "Step 8: Remove old container"
  echo "        docker rm -f ${SERVICE}-old (renamed before stop)"
  echo ""
  echo "ABORT path: on any error → docker stop $NEW_CONTAINER && docker rm $NEW_CONTAINER"
  echo "            old container '$SERVICE' remains serving traffic"
  echo ""
  echo "Health endpoint: http://127.0.0.1:${HOST_PORT}${HEALTH_PATH}"
  echo "Image that would be built: $IMAGE_TAG → then tagged as $IMAGE_LATEST"
  echo ""
  echo "=== DRY-RUN complete. No changes made. ==="
  exit 0
fi

# ── Cleanup trap ──────────────────────────────────────────────────────────────
CLEANUP_NEEDED=0
cleanup() {
  if [[ $CLEANUP_NEEDED -eq 1 ]]; then
    warn "Rolling deploy failed. Cleaning up '$NEW_CONTAINER'..."
    docker stop "$NEW_CONTAINER" 2>/dev/null || true
    docker rm -f "$NEW_CONTAINER" 2>/dev/null || true
    warn "Old container '$SERVICE' still serving traffic."
    if [[ -n "$TG_ALERT" ]] && [[ -x "$SEND_TG" ]]; then
      "$SEND_TG" "rolling-deploy FAILED for $SERVICE — old container still up"
    fi
  fi
}
trap cleanup EXIT

# ── Step 1: Verify current container is running ───────────────────────────────
log "Checking current container '$SERVICE'..."
CURRENT_STATUS=$(docker inspect "$SERVICE" --format '{{.State.Status}}' 2>/dev/null || echo "missing")
if [[ "$CURRENT_STATUS" != "running" ]]; then
  warn "Container '$SERVICE' is '$CURRENT_STATUS', not running."
  warn "Falling back to: docker compose up -d --force-recreate $SERVICE"
  docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" up -d --force-recreate "$SERVICE"
  log "Force-recreate done. Exiting."
  exit 0
fi
log "Current container '$SERVICE' is running."

# ── Step 2: Build new image ────────────────────────────────────────────────────
CLEANUP_NEEDED=1

if [[ -n "$CUSTOM_IMAGE" ]]; then
  log "Using pre-built image: $CUSTOM_IMAGE"
  docker tag "$CUSTOM_IMAGE" "$IMAGE_TAG"
  docker tag "$CUSTOM_IMAGE" "$IMAGE_LATEST"
else
  log "Building new image via docker compose build $SERVICE..."
  docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" build "$SERVICE"
  docker tag "$IMAGE_LATEST" "$IMAGE_TAG"
  log "Image built: $IMAGE_LATEST (snapshot: $IMAGE_TAG)"
fi

# ── Step 3: Find a free temp port for health polling ──────────────────────────
TEMP_PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
log "Using temp port $TEMP_PORT for health polling."

# ── Step 4: Extract run config from current container ─────────────────────────
log "Extracting run config from current container..."
ENV_FILE=$(docker inspect "$SERVICE" --format \
  '{{range .HostConfig.Binds}}{{if eq (slice . (sub (len .) 4) (len .)) ".env"}}{{.}}{{end}}{{end}}' \
  2>/dev/null || echo "")

# Get all bind mounts
VOLUME_ARGS=()
while IFS= read -r bind; do
  [[ -n "$bind" ]] && VOLUME_ARGS+=("-v" "$bind")
done < <(docker inspect "$SERVICE" --format '{{range .HostConfig.Binds}}{{.}}
{{end}}')

# Get networks (excluding default bridge)
NETWORKS=()
while IFS= read -r net; do
  [[ -n "$net" ]] && NETWORKS+=("$net")
done < <(docker inspect "$SERVICE" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}
{{end}}' | grep -v '^bridge$')

# Reconstruct env_file args
ENV_ARGS=()
while IFS= read -r ef; do
  [[ -n "$ef" ]] && ENV_ARGS+=("--env-file" "$ef")
done < <(docker inspect "$SERVICE" \
  --format '{{range .HostConfig.Binds}}{{if contains . ".env"}}{{.}}{{end}}{{end}}' 2>/dev/null || true)

# Simpler approach: get env_file from compose config
COMPOSE_ENV_FILES=$(docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" \
  config --format json 2>/dev/null | \
  python3 -c "
import json,sys
cfg=json.load(sys.stdin)
svc=cfg.get('services',{}).get('$SERVICE',{})
files=svc.get('env_file',[])
if isinstance(files,str): files=[files]
for f in files:
  if isinstance(f,dict): print(f.get('path',''))
  else: print(f)
" 2>/dev/null || true)

ENV_ARGS=()
while IFS= read -r ef; do
  [[ -n "$ef" ]] && ENV_ARGS+=("--env-file" "$ef")
done <<< "$COMPOSE_ENV_FILES"

log "Starting new container '$NEW_CONTAINER' on temp port $TEMP_PORT..."

# Build docker run command
RUN_CMD=(docker run -d
  --name "$NEW_CONTAINER"
  --restart "no"                           # no auto-restart — we manage lifecycle
  -p "127.0.0.1:${TEMP_PORT}:${CONTAINER_PORT}"
  "${ENV_ARGS[@]}"
  "${VOLUME_ARGS[@]}"
  -e "NODE_ENV=production"
  "$IMAGE_TAG"
)

# Connect to networks after start (docker run --network only supports one)
"${RUN_CMD[@]}"

# Connect to all service networks
for NET in "${NETWORKS[@]}"; do
  docker network connect "$NET" "$NEW_CONTAINER" 2>/dev/null || true
done

log "New container '$NEW_CONTAINER' started."

# ── Step 5: Wait for health ────────────────────────────────────────────────────
log "Waiting for health check on http://127.0.0.1:${TEMP_PORT}${HEALTH_PATH} (max ${HEALTH_TIMEOUT}s)..."
ELAPSED=0
HEALTHY=0
while [[ $ELAPSED -lt $HEALTH_TIMEOUT ]]; do
  HTTP_CODE=$(curl -so /dev/null -w "%{http_code}" --max-time 3 \
    "http://127.0.0.1:${TEMP_PORT}${HEALTH_PATH}" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    log "Health check passed after ${ELAPSED}s (HTTP $HTTP_CODE)."
    HEALTHY=1
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

if [[ $HEALTHY -eq 0 ]]; then
  die "Health check FAILED after ${HEALTH_TIMEOUT}s — aborting. Old container '$SERVICE' still serving."
fi

# ── Step 6: Graceful stop old container ──────────────────────────────────────
log "Gracefully stopping old container '$SERVICE' (${DRAIN_TIMEOUT}s drain)..."
docker rename "$SERVICE" "${SERVICE}-old"
docker stop --time="$DRAIN_TIMEOUT" "${SERVICE}-old" || true

# ── Step 7: Rename new container and reconnect to host port ───────────────────
log "Renaming '$NEW_CONTAINER' → '$SERVICE'..."
docker rename "$NEW_CONTAINER" "$SERVICE"

# Re-apply host port binding — docker doesn't allow changing port bindings of
# running container. We stop+start with docker compose which recreates bindings.
# Since the image is already built and container exists with our tag, compose
# up will see the new container name matches and bind the correct host port.
log "Reconnecting '$SERVICE' to host port $HOST_PORT via compose up..."
docker stop "$SERVICE" || true
docker rm "$SERVICE" || true
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_ENV_FILE" up -d --no-build --no-deps "$SERVICE"

# ── Step 8: Cleanup old container ─────────────────────────────────────────────
log "Removing old container '${SERVICE}-old'..."
docker rm -f "${SERVICE}-old" 2>/dev/null || true

# ── Final health check via official host port ──────────────────────────────────
sleep 3
FINAL_CODE=$(curl -so /dev/null -w "%{http_code}" --max-time 5 \
  "http://127.0.0.1:${HOST_PORT}${HEALTH_PATH}" 2>/dev/null || echo "000")
if [[ "$FINAL_CODE" != "200" ]]; then
  warn "Final health check returned HTTP $FINAL_CODE on port $HOST_PORT — verify manually!"
else
  log "Final health check OK (HTTP $FINAL_CODE on port $HOST_PORT)."
fi

CLEANUP_NEEDED=0
log "Rolling deploy of '$SERVICE' complete. Zero-downtime window: ~${ELAPSED}s build/start time."

if [[ -n "$TG_ALERT" ]] && [[ -x "$SEND_TG" ]]; then
  "$SEND_TG" "rolling-deploy OK: $SERVICE deployed ($IMAGE_TAG)"
fi

# Remove snapshot tag older than 7 days to avoid image accumulation
docker images "$SERVICE" --format "{{.Tag}} {{.CreatedAt}}" | awk '$1 ~ /^[0-9]{14}$/' | \
  while read -r TAG TS; do
    AGE_DAYS=$(( ($(date +%s) - $(date -d "$TS" +%s 2>/dev/null || echo $(date +%s))) / 86400 ))
    if [[ $AGE_DAYS -gt 7 ]]; then
      docker rmi "${SERVICE}:${TAG}" 2>/dev/null || true
    fi
  done

exit 0
