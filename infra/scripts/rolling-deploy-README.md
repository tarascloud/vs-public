# rolling-deploy.sh — Zero-downtime deploys (DEV-20260507-0021)

## What

Replaces `docker compose up -d --force-recreate <service>` (10-20s downtime) with
a zero-downtime rolling deploy pattern for all prod Next.js services.

## Approach: docker network alias swap

**No nginx proxy, no Cloudflare API calls required.**

1. Build new image with timestamp snapshot tag (`service:YYYYMMDDHHmmss`)
2. Start `<service>-new` on a randomly-assigned temp port (no host conflict)
3. Connect to same docker networks as current container
4. Poll `http://127.0.0.1:TEMP_PORT/api/health` until HTTP 200 (max 60s)
5. Rename current → `<service>-old`, stop with 10s SIGTERM drain
6. Rename `<service>-new` → `<service>`
7. `docker compose up -d --no-build --no-deps <service>` re-applies host port binding
8. Remove `<service>-old`

On failure at any step: cleanup trap removes `<service>-new`, old container keeps serving.

## Supported services

| Make target   | Container   | Port | Health path |
|---------------|-------------|------|-------------|
| `make deploy-pd`      | pd-prod     | 8003 | /api/health |
| `make deploy-jf`      | jobfinder   | 3456 | /api/health |
| `make deploy-ko`      | korobkov    | 8060 | /api/health |
| `make deploy-sh`      | sh          | 8040 | /api/health |
| `make deploy-bp`      | bp          | 8050 | /api/health |
| `make deploy-vs`      | vs-landing  | 8020 | /healthz    |
| `make deploy-tatiana` | tatiana     | 8085 | /healthz    |
| `make deploy-owner`   | owner       | 8080 | /healthz    |

## Usage

```bash
# Dry-run (shows planned actions, no changes)
bash /opt/docker/scripts/rolling-deploy.sh --dry-run pd-prod

# Normal deploy (build + roll)
bash /opt/docker/scripts/rolling-deploy.sh pd-prod

# Deploy pre-built image (e.g. built on CI)
bash /opt/docker/scripts/rolling-deploy.sh pd-prod pd-prod:20260507123000

# Via Makefile shorthand
make -C /opt/docker deploy-pd
make -C /opt/docker deploy-dry-pd
```

## First-time setup on VPS

The script must be symlinked into `/opt/docker/scripts/` and Makefile targets added:

```bash
# On VPS
ln -sf /opt/repos/vibe-studio/infra/scripts/rolling-deploy.sh \
       /opt/docker/scripts/rolling-deploy.sh

# Add Makefile targets — see rolling-deploy-makefile-additions.txt in this dir
```

## Makefile additions

See `rolling-deploy-makefile-additions.txt` for the exact lines to add to
`/opt/docker/Makefile` after the existing `deploy-%:` target.

## Env variables (optional overrides)

| Var | Default | Description |
|-----|---------|-------------|
| `COMPOSE_FILE` | `/opt/docker/docker-compose.yml` | Compose file path |
| `COMPOSE_ENV_FILE` | `/opt/docker/.env` | Compose env file |
| `HEALTH_TIMEOUT` | `60` | Max seconds to wait for healthy |
| `DRAIN_TIMEOUT` | `10` | Seconds for SIGTERM drain of old container |
| `TG_ALERT` | `` | Set to `1` to send Telegram alerts on success/failure |

## Fallback (always available)

If rolling deploy fails or the service is not yet running (first deploy),
the script automatically falls back to `docker compose up -d --force-recreate`.
