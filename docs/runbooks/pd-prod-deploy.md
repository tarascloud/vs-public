# PD Prod Deploy Runbook

## Pre-conditions

Before deploying `pd-prod` (or `pd-dev`):

1. **Confirm with Owner** — prod deploys require explicit approval
2. **Ensure you are on `main` branch** — never deploy from a feature branch
3. **Run pre-deploy backup** (mandatory)

## Step 1 — Pre-deploy backup

```bash
# Option A: Makefile target (preferred)
ssh vps 'cd /opt/docker && make backup-now'

# Option B: Direct pg_dump
ssh vps 'docker exec pg pg_dump -U pd pd_prod | gzip > /opt/docker/backups/pd_prod_backup_$(date +%Y%m%d_%H%M%S).sql.gz'

# Verify backup size > 1MB
ssh vps 'ls -lh /opt/docker/backups/pd_prod_backup_*.sql.gz | tail -1'
```

If backup is < 1 MB — **STOP**. Database may be unhealthy. Investigate before proceeding.

## Step 2 — Pull latest code

```bash
ssh vps 'git pull origin main'
```

## Step 3 — Build image

Build must happen **on VPS** (amd64). Never build on Mac (arm64).

```bash
ssh vps 'cd /opt/repos/vibe-studio/pd-private/next && \
  docker build \
    --build-arg DATABASE_URL="postgresql://pd:pd@pg:5432/pd_prod" \
    -t pd-prod:latest \
    -t pd-dev:latest \
    .'
```

## Step 4 — Deploy

```bash
ssh vps 'cd /opt/docker && docker compose up -d --force-recreate pd-prod pd-dev'
```

## Step 5 — Post-deploy smoke check (mandatory)

Per `.claude/rules/deploy-smoke.md` — always run real browser check after prod deploy.

```bash
# 1. HTTP 200
curl -sS -o /dev/null -w "%{http_code}\n" https://pd.example.com | grep -q 200 || echo "FAIL: HTTP not 200"

# 2. API health
curl -sS https://pd.example.com/api/health | grep -q '"status":"ok"' || echo "FAIL: health check"

# 3. Playwright smoke (Claude Code session with playwright MCP):
#    mcp__playwright__browser_navigate url=https://pd.example.com
#    Assert: no CSP violations, no hydration errors, navigation visible
```

If you see CSP violations in the browser console — **rollback immediately** (see below).

## Rollback procedure

```bash
# 1. Check previous image tag
ssh vps 'docker images pd-prod --format "table {{.Tag}}\t{{.CreatedAt}}"'

# 2. If previous :latest is still available — re-tag and redeploy
# (images are overwritten on each build — keep a dated tag for rollback)
ssh vps 'docker tag pd-prod:20260501 pd-prod:latest && cd /opt/docker && docker compose up -d --force-recreate pd-prod'

# 3. Restore DB if schema migration was included
ssh vps 'gunzip -c /opt/docker/backups/pd_prod_backup_YYYYMMDD_HHMMSS.sql.gz | docker exec -i pg psql -U pd pd_prod'
```

## Scheduler and Bot

`pd-scheduler` and `pd-bot` share the same image. If their containers need restart after deploy:

```bash
ssh vps 'cd /opt/docker && docker compose restart pd-scheduler pd-bot'
```

## Checklist summary

- [ ] Owner approval received
- [ ] On `main` branch
- [ ] Pre-deploy backup created and > 1MB
- [ ] Built on VPS (not Mac)
- [ ] Container started without error (`docker logs pd-prod --tail 20`)
- [ ] HTTP 200 on https://pd.example.com
- [ ] `/api/health` returns `{"status":"ok"}`
- [ ] Playwright smoke: no CSP / hydration errors
