# VS Infrastructure

Docker Compose stack для VPS (Ubuntu 24.04, /opt/docker/).

`docker-compose.yml` — симлінк з `/opt/docker/docker-compose.yml`.

## Сервіси

### Databases
- `pg` — PostgreSQL 16 + pgvector (8GB shared_buffers)
- `pgbouncer` — connection pooling
- `redis` — кеш і черги

### Application services
- `pd-prod` / `pd-dev` / `pd-scheduler` / `pd-bot` — Personal Dashboard
- `vs-landing` — Vibe Studio landing (port 8020)
- `website` / `booking-api` — example.com + calendar API
- `jobfinder` — JobFinder (port 3456)
- `status` — моніторинг (port 8090, network_mode: host)
- `freqtrade` — trading bot (internal 9001)
<!-- sh / sh-worker / sh-bot — Shuleansky, DECOMMISSIONED 2026-08-03 -->

### Infrastructure
- `cloudflared` — Cloudflare Tunnel (network_mode: host)
- `ollama` — local LLM (internal 9002)
- `infisical` — secrets manager (port 8010)
- `infisical-agent` — auto-generates .env files from Infisical
- `stalwart` — mail server (roundcube webmail decommissioned 2026-08-03)
- `registry` — Docker registry (internal 5000)

### MemPalace (long-term memory MCP)

#### `mempalace` (stdio, local access)
- Port: `127.0.0.1:8031` → ingestion sidecar (FastAPI /search, /ingest/*)
- MCP access: via SSH forced-command (mempalace-mac-key) або `docker exec -i`
- Palace data: `/opt/docker/mempalace/palace`

#### `mempalace-sse` (SSE bridge, LAN/Tailscale access)
- Port: `0.0.0.0:8032` — **UFW restricts to LAN (10.0.0.0/24) + Tailscale (100.64.0.0/10) only**
- **NO Cloudflare Tunnel route** — mempalace залишається непублічним
- Architecture: `sse_auth_proxy.py (8032)` → `mcp-proxy (127.0.0.1:8033)` → `mempalace.mcp_server (stdio)`
- Auth: `Authorization: Bearer <MEMPALACE_BEARER_TOKEN>` (timing-safe check)
- Token: Infisical → проект `mempalace` → `MEMPALACE_BEARER_TOKEN`
- Hardening: `read_only`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit: 128`, tmpfs for /tmp і /home/mempalace/.mempalace

**Mac MCP config** (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "mempalace": {
      "type": "sse",
      "url": "http://100.64.0.10:8032/sse",
      "headers": {
        "Authorization": "Bearer <MEMPALACE_BEARER_TOKEN>"
      }
    }
  }
}
```

Детальніше: `services/mempalace/docs/install-mac.md`

## Networks
- `backend` — internal: true (DB, Redis, internal services)
- `frontend` — external (web services, port publishing)

## Secrets
Всі secrets в `/opt/docker/secrets/` генеруються Infisical Agent автоматично.
Не комітити `.env` файли.

## Useful commands
```bash
# Status
ssh vps 'cd /opt/docker && docker compose ps'

# Logs
ssh vps 'cd /opt/docker && docker compose logs --tail 20 mempalace-sse'

# Restart SSE bridge
ssh vps 'cd /opt/docker && docker compose restart mempalace-sse'

# UFW status для mempalace
ssh vps 'sudo ufw status | grep 8032'
```

## Zero-downtime deploys

Script: `infra/scripts/rolling-deploy.sh` (DEV-20260507-0021)

Replaces `docker compose up -d --force-recreate` (10-20s downtime) for prod Next.js
services. Uses docker network alias swap — no nginx proxy, no Cloudflare API calls.

See `infra/scripts/rolling-deploy-README.md` for full documentation.

```bash
# First-time setup on VPS (once)
ln -sf /opt/repos/vibe-studio/infra/scripts/rolling-deploy.sh \
       /opt/docker/scripts/rolling-deploy.sh
# Then add Makefile targets from infra/scripts/rolling-deploy-makefile-additions.txt

# Usage
make -C /opt/docker deploy-pd        # zero-downtime deploy pd-prod
make -C /opt/docker deploy-dry-pd    # dry-run
bash /opt/docker/scripts/rolling-deploy.sh pd-prod
```
