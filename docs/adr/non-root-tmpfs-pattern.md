# ADR: Non-root container writable dirs via tmpfs

**Status:** Accepted
**Date:** 2026-05-07
**Deciders:** Борода (DevSecOps)
**Refs:** INFRA-02 (ttyd-proxy), INFRA-06 (vs-landing)

## Context

Security baseline: containers run as non-root user (`USER` directive у Dockerfile або `user:` у compose). Зменшує blast radius при container escape, відповідає CIS Docker Benchmark.

Проблема: typical multi-stage build робить файли COPY як root. Build-time root створює структуру `/app/`, `/var/cache/nginx/`, etc. Run-time non-root user не має write access до цих dirs.

Конкретні приклади:
- nginx (UID 101): `/var/cache/nginx/client_temp`, `/var/run/nginx.pid`
- Next.js (UID 1000 node): `/app/.next/cache/images/` для image optimization
- Apache (www-data): `/var/log/apache2/`, `/var/lock/apache2/`
- Python web frameworks: `__pycache__`, tmp uploads

## Decision

**Use `tmpfs:` mount for ephemeral writable dirs needed by non-root container.**

```yaml
service:
  user: "1000:1000"
  tmpfs:
    - /app/.next/cache:uid=1000,gid=1000,mode=0755
    - /var/cache/nginx:uid=101,gid=101,mode=0755
    - /var/run:uid=101,gid=101,mode=0755
```

UID/GID **must match** runtime user. mode=0755 (or 0750) залежно від чутливості.

## Alternatives considered

### A. Volume mount with chown

```yaml
volumes:
  - /opt/docker/<service>/cache:/app/.next/cache
```
Pre-step: `sudo chown -R 1000:1000 /opt/docker/<service>/cache`.

**Pros:** Cache persists across recreate (warm-start).
**Cons:** Requires VPS-side prep, extra disk usage, cache pollution.

### B. Dockerfile chown before USER

```dockerfile
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next/cache
USER node
```

**Pros:** Most "correct" — fix at image level.
**Cons:** Requires image rebuild, не fix-able через config alone, harder to apply post-deploy.

### C. tmpfs (chosen)

**Pros:**
- Compose-only change (no rebuild)
- In-memory (fast, no disk wear)
- Auto-cleared on recreate (consistent state)
- Recreate-safe

**Cons:**
- Cache lost on recreate (cold start після redeploy)
- Memory cost (small для cache dirs)
- Not suitable for large caches (e.g. Next.js full-page cache, Whisper models)

## Trade-offs

| Aspect | tmpfs (chosen) | Volume | Dockerfile |
|---|---|---|---|
| Setup effort | minimal | medium | high |
| Persistent cache | no | yes | depends |
| Recreate safe | yes | yes | yes |
| Memory cost | small-med | none | none |
| Disk cost | none | dir size | none |
| Image rebuild | no | no | yes |

## When to apply

Apply tmpfs pattern when:
1. New non-root container fails з EACCES на writable dir
2. Dir is **ephemeral cache/runtime** (not source-of-truth data)
3. Cache size < ~100 MB (memory-friendly)
4. Cache regen cost is low (next image fetch acceptable)

DON'T apply tmpfs for:
- Persistent application data (databases, user uploads, ML model weights)
- Logs that must survive recreate (use volume + log rotation)
- Multi-GB caches (memory pressure) — use volume з chown

## Examples in this repo

### INFRA-02 ttyd-proxy

```yaml
ttyd-proxy:
  user: "101:101"
  tmpfs:
    - /var/cache/nginx:uid=101,gid=101,mode=0755
    - /var/run:uid=101,gid=101,mode=0755
```

Commit: `b055b1e2` / `1fb5f3cb`

### INFRA-06 vs-landing

```yaml
vs-landing:
  user: "node"  # UID 1000
  tmpfs:
    - /app/.next/cache:uid=1000,gid=1000,mode=0755
```

Commit: `3c06e63f`

## Migration checklist for new non-root container

1. Run `docker exec <container> id` → note UID/GID
2. Find writable dirs: `docker logs <container> 2>&1 | grep EACCES`
3. Add `tmpfs` to compose with matching UID/GID
4. Recreate: `docker compose up -d --force-recreate <service>`
5. Verify: `docker logs <container> --since 5m | grep -c EACCES` → 0
6. Verify: feature that uses cache works (e.g. /next/image returns 200)

## Future evolution

- При extracting `@vibe-studio/docker-base` images package — embed standard tmpfs hints у image labels
- Якщо cache size crosses 100 MB threshold → reconsider volume з chown
- Якщо image rebuild стає trivial (good CI), prefer Dockerfile chown — single source of truth
