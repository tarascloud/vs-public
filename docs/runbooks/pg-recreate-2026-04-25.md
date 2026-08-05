# pg recreate runbook — 2026-04-25
# INFRA-03 + INFRA-08

## Background

- pg container is on legacy `docker_backend` network (IP `172.18.0.11`), NOT on the compose-managed `backend` network
- `status` service uses `extra_hosts: ["pg:172.18.0.11"]` — hardcoded legacy IP (drift risk if pg moves)
- Goal: move pg to compose-managed `backend` network, remove hardcoded extra_hosts from status, clean up orphan `docker_backend` and `docker_frontend` networks

## Pre-requisites

- Maintenance window (>30 min, off-hours recommended)
- All services healthy before starting
- Recent backup (< 1 hour old)

## Step 0: Snapshot check

```bash
ssh vps 'docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"'
ssh vps 'docker exec pg psql -U postgres -c "\l"'
```

## Step 1: Dump ALL 12 databases

```bash
TS=$(date +%Y%m%d_%H%M%S)
DUMP_DIR="/opt/docker/backups/pre-recreate-${TS}"
ssh vps "mkdir -p ${DUMP_DIR}"

for DB in pd_prod pd_dev jobfinder vs infisical korobkov mempalace sh bp_dev bp_prod status postgres; do
  echo "Dumping $DB..."
  ssh vps "docker exec pg pg_dump --create -U postgres $DB | gzip > ${DUMP_DIR}/${DB}.sql.gz"
  ssh vps "du -sh ${DUMP_DIR}/${DB}.sql.gz"
done
```

Verify all dumps > 1KB (status and template DBs may be smaller, but `vs`, `pd_prod`, `mempalace` must be > 1MB):
```bash
ssh vps "ls -lh ${DUMP_DIR}/*.sql.gz"
```

## Step 2: Stop all services that use pg

```bash
ssh vps 'cd /opt/docker && docker compose stop pd-prod pd-dev pgbouncer jobfinder sh sh-worker sh-bot korobkov ko-bot mempalace status vs-landing infisical'
# Note: pd-scheduler, pd-bot also use pg via pgbouncer
ssh vps 'cd /opt/docker && docker compose stop pd-scheduler pd-bot'
# bp if running
ssh vps 'docker stop bp 2>/dev/null; true'
# tatiana if it uses pg
ssh vps 'docker stop tatiana 2>/dev/null; true'
```

## Step 3: Edit docker-compose.yml — pg network config

In `infra/docker-compose.yml`, the `pg` service should NOT have a `networks:` override that pins it to `docker_backend`. After the recreate it will join only the compose-managed `backend` network.

Verify pg service has no explicit `networks:` that forces `docker_backend`:
```bash
ssh vps 'grep -A 5 "container_name: pg" /opt/docker/docker-compose.yml'
```

If pg is missing from the `networks:` key entirely — it defaults to the compose default which IS the `backend` network. No change needed to the compose file unless pg has an explicit `docker_backend` override.

## Step 4: Update status extra_hosts

In `infra/docker-compose.yml`, find the `status` service and update `extra_hosts`:

```yaml
# REMOVE:
extra_hosts:
  - "pg:172.18.0.11"

# REPLACE WITH (pg will now be reachable via DNS on backend network via pgbouncer):
# status uses network_mode: host so it cannot use backend DNS directly.
# pg will be at its new compose-managed IP on backend network.
# After recreate, verify pg's new IP with:
#   docker inspect pg | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; print(c['NetworkSettings']['Networks']['backend']['IPAddress'])"
# Then update extra_hosts with the new IP:
extra_hosts:
  - "pg:<new-backend-ip>"
```

Alternatively, expose pg on `127.0.0.1:5432` (host port) so status can reach it via localhost without extra_hosts. Add to pg service in compose:
```yaml
ports:
  - "127.0.0.1:5432:5432"
```
Then status can use `localhost:5432` and `extra_hosts` can be removed entirely.

**Recommendation: expose pg on 127.0.0.1:5432 — cleanest solution.**

## Step 5: Force-recreate pg

```bash
ssh vps 'cd /opt/docker && docker compose up -d --force-recreate pg'
sleep 10
ssh vps 'docker exec pg pg_isready -U postgres'
# Get new IP
ssh vps 'docker inspect pg | python3 -c "import sys,json; c=json.load(sys.stdin)[0]; nets=c['\''NetworkSettings'\'']['\''Networks'\'']; [print(k, v['\''IPAddress'\'']) for k,v in nets.items()]"'
```

pg should now be on `backend` network only (not `docker_backend`).

## Step 6: Restart dependents

```bash
ssh vps 'cd /opt/docker && docker compose up -d pgbouncer mempalace infisical'
sleep 15
ssh vps 'cd /opt/docker && docker compose up -d pd-prod pd-dev pd-scheduler pd-bot jobfinder sh sh-worker sh-bot korobkov ko-bot status vs-landing tatiana'
```

## Step 7: Smoke checks

```bash
# Health endpoints
for url in pd.example.com dev.example.com jobfinder.example.com status.example.com sh.example.com ko.example.com vibe-studio.example.com; do
  echo -n "$url: "; curl -sI "https://$url" | head -1
done

# DB connectivity
ssh vps 'docker exec pg psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"'
ssh vps 'docker exec pg psql -U pd pd_prod -c "SELECT count(*) FROM \"Transaction\" LIMIT 1" 2>/dev/null'

# API status
TOKEN="9061e621e231a7aed9470dbecb99d005e88db0a3f71cd425104e964c5846a477"
curl -H "Authorization: Bearer $TOKEN" https://status.example.com/api/status | python3 -c "import sys,json; d=json.load(sys.stdin); print('services:', len(d))"
```

## Step 8: Remove orphan networks (only after all services healthy)

```bash
ssh vps 'docker network rm docker_backend docker_frontend docker_default 2>/dev/null; true'
ssh vps 'docker network ls'
```

## Rollback

If any service fails to connect after pg recreate:
1. Check pg IP: `docker inspect pg | grep IPAddress`
2. Update `extra_hosts` in compose for `status` if still using host network
3. If critical failure: restore from dump
   ```bash
   gunzip -c ${DUMP_DIR}/pd_prod.sql.gz | docker exec -i pg psql -U postgres
   # repeat for each DB
   ```

## Notes

- `pgbouncer` container must restart after pg recreate (it holds connection pool to pg's IP)
- `infisical` uses pg/infisical DB — restart after pg up
- `mempalace` uses pgvector extension — ensure it exists: `docker exec pg psql -U mempalace mempalace -c "SELECT extname FROM pg_extension WHERE extname='vector'"`
- `status` is on `network_mode: host` — does not join `backend` network, uses `extra_hosts` or host port
