# ADR: ttyd-proxy Architecture

**Date:** 2026-05-04
**Status:** Accepted
**Author:** DevSecOps agent

## Context

`ttyd` is a web-based terminal emulator that exposes a Unix shell over WebSocket/HTTPS. On VPS it runs as a native process (outside Docker) on port 7681, providing terminal access to the host. A reverse proxy (`ttyd-proxy`) sits in front, adding IP allowlist enforcement before forwarding WebSocket connections to ttyd.

### Problem history

1. **Port conflict (7682):** The native ttyd processes (pid 556060/556062) occupy host ports `7681` and `7682`. Docker bound ttyd-proxy to `127.0.0.1:7682:80`, creating a bind conflict since the host-level port 7682 was already in use.

2. **nginx non-root crash:** `ttyd-proxy` used `user: "101:101"` (nginx non-root per REV-12 policy). However nginx needs to write `/var/cache/nginx/client_temp` and `/var/run/nginx.pid` on startup — directories owned by root in the base image. Without write access the container crashed with `mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)` and restarted in a crash loop.

3. **Healthcheck false-negative:** The original healthcheck used `wget -q --spider http://127.0.0.1/` which exits non-zero on HTTP 401 (expected — ttyd requires auth). This caused the container to be marked `unhealthy` even when nginx was fully operational.

## Decision

### 1. Port: 7683 (not 7682)

Changed `ports` mapping from `127.0.0.1:7682:80` to `127.0.0.1:7683:80` to avoid conflict with the native ttyd port 7682. Port 7681 is ttyd's primary WebSocket port, 7682 is the second instance — both native. Docker-side proxy uses 7683.

No Cloudflare tunnel route exists for ttyd (intentional — terminal access is Tailscale/LAN only). No tunnel config change required.

### 2. tmpfs for nginx writable dirs

Added `tmpfs` mounts in docker-compose:
```yaml
tmpfs:
  - /var/cache/nginx:uid=101,gid=101,mode=0755
  - /var/run:uid=101,gid=101,mode=0755
```

This provides writable in-memory storage for nginx's temp dirs while keeping the container filesystem read-only-friendly and maintaining the non-root user policy. No data is persisted (correct — nginx cache is ephemeral by design).

### 3. Healthcheck updated to accept HTTP 4xx

```yaml
test: ["CMD-SHELL", "wget -q --server-response http://127.0.0.1/ 2>&1 | grep -qE \"HTTP/.*[0-9]+ [0-9]+\""]
```

Checks for any valid HTTP response (including 401 Unauthorized from ttyd auth) rather than requiring HTTP 200. nginx responding with 401 confirms the proxy is running and routing correctly.

## Nginx proxy configuration

`/opt/docker/ttyd-proxy/nginx.conf` proxies to `http://host.docker.internal:7681` with WebSocket upgrade headers and `proxy_read_timeout 3600s` (required for persistent terminal sessions). IP allowlist restricts access to:
- `203.0.113.10` (Owner home IP)
- `10.0.0.0/24` (LAN)
- `100.64.0.0/10` (Tailscale CGNAT range)
- `127.0.0.1` + `172.16.0.0/12` (localhost + Docker bridge)

## Security posture

- No public CF tunnel for ttyd — terminal is LAN/Tailscale only
- IP allowlist in nginx denies all non-trusted sources
- Non-root user (101:101) maintained per REV-12 policy
- No secrets in environment — ttyd handles its own auth

## Consequences

- ttyd-proxy runs healthy on port 7683 with non-root nginx
- Future: if ttyd moves to a Docker container, remove `host.docker.internal` extra_host and use Docker network DNS
- If a second ttyd instance is added, ports 7684+ should be used to avoid conflict pattern
