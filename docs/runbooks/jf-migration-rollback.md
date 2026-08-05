# JobFinder Prisma Migration — Rollback Runbook

## Smoke Test Results (JF-MIG-03, 2026-05-12)

All 5 checks passed against live prod `jobfinder.example.com`:

| Check | Result | Evidence |
|-------|--------|----------|
| 1. Container entrypoint log | PASS | `[entrypoint] Running prisma migrate deploy...` → `[entrypoint] Migrations done. Starting server...` → `✓ Ready in 0ms` |
| 2. Health endpoint | PASS | `{"status":"ok","db":"ok","timestamp":"2026-05-12T07:53:33.901Z"}` |
| 3. `_prisma_migrations` state | PASS | `count=23`, `all_applied=t` |
| 4. `detailed_analysis` column E2E | PASS | `BEGIN; INSERT ... RETURNING id, detailed_analysis` returned row with jsonb intact; `ROLLBACK` cleaned up — no pollution |
| 5. Restart idempotency | PASS | After `docker compose up -d --force-recreate`, same entrypoint flow: `migrate deploy` → `Migrations done` → no new migrations applied; health came up in <2s |

Note: JF uses its own compose file at `/opt/repos/vibe-studio/jf-private/docker-compose.prod.yml`, not the main VS `/opt/docker/docker-compose.yml`.

---

## When to use this runbook

A JF deploy failed mid-migrate-deploy. Symptoms:
- Container stuck in restart loop after `docker compose -f docker-compose.prod.yml up -d --force-recreate`
- `docker logs jobfinder` shows `[entrypoint] Running prisma migrate deploy...` followed by a Prisma error (P1xxx, P3xxx)
- `_prisma_migrations` may have a row with `finished_at IS NULL` and `logs` filled — that is a partially-applied migration

## Pre-flight check (do this before deploying any new migration)

1. Verify a fresh pg backup exists:
   ```bash
   ssh vps 'ls -1tr /opt/docker/backups/jobfinder_backup_*.sql.gz | tail -1'
   ```
   Must be less than 24h old.

2. If not — take one manually:
   ```bash
   ssh vps 'docker exec pg pg_dump -U jobfinder jobfinder | gzip > /opt/docker/backups/jobfinder_pre_migration_$(date +%Y%m%d_%H%M%S).sql.gz'
   ```
   Confirm it is greater than 1MB.

3. Note the current image tag/digest for quick rollback:
   ```bash
   ssh vps 'docker images jobfinder --format "{{.Tag}} {{.ID}} {{.CreatedAt}}" | head -5'
   ```

## Failure modes and recovery

### Mode 1: migrate deploy failed during ALTER TABLE (data-incompatible change)

1. Identify the failing migration:
   ```bash
   ssh vps 'docker exec pg psql -U jobfinder -d jobfinder -c "SELECT migration_name, finished_at, logs FROM _prisma_migrations WHERE finished_at IS NULL;"'
   ```

2. Read its SQL in `jf-private/prisma/migrations/<migration_name>/migration.sql` to understand what failed.

3. Inspect the `logs` column value — it contains Prisma/psql stderr with the exact error.

4. Decide: can we manually fix data and retry, or must we revert?

5. To mark the migration as rolled back in Prisma's tracking table:
   ```bash
   ssh vps 'docker exec pg psql -U jobfinder -d jobfinder -c "UPDATE _prisma_migrations SET rolled_back_at = NOW() WHERE finished_at IS NULL;"'
   ```
   Or via Prisma CLI inside a temporary container:
   ```bash
   npx prisma migrate resolve --rolled-back <migration_name>
   ```

6. Pin the previous JF image:
   ```bash
   # Find the previous image ID
   ssh vps 'docker images jobfinder'
   # Tag the old image back as latest
   ssh vps 'docker tag <old-image-id> jobfinder:latest'
   ```

7. Restart with pinned image:
   ```bash
   ssh vps 'cd /opt/repos/vibe-studio/jf-private && docker compose -f docker-compose.prod.yml up -d --force-recreate'
   ```
   Should boot cleanly since `_prisma_migrations` now shows the failed migration as rolled back.

### Mode 2: entrypoint.sh itself fails (script bug, missing prisma binary, missing env var)

Symptoms: container exits immediately, logs show an `entrypoint.sh` error before any Prisma output, or `sh: prisma: not found`.

1. Container will not start past entrypoint. Pin previous image (see Mode 1 step 6–7).
2. Inspect what broke:
   ```bash
   ssh vps 'docker run --rm --entrypoint sh jobfinder:latest -c "which prisma && prisma --version"'
   ```
3. If the issue is in the entrypoint script source: revert the jf-private commit on main in a new branch, get it reviewed, then redeploy.
4. Document the bug in the initiative `cmp1qpldo000401mg43fpa2wx`.

### Mode 3: `_prisma_migrations` table accidentally dropped or corrupted

1. Recreate tracking by marking all existing migration directories as applied. From `jf-private/`:
   ```bash
   for dir in prisma/migrations/*/; do
     name=$(basename "$dir")
     [[ "$name" == "_*" ]] && continue
     npx prisma migrate resolve --applied "$name"
   done
   ```
2. Verify:
   ```bash
   ssh vps 'docker exec pg psql -U jobfinder -d jobfinder -c "SELECT count(*) FROM _prisma_migrations;"'
   ```
   Count must match `ls -d jf-private/prisma/migrations/*/ | wc -l`.

## Recovery from full DB restore

Use this only when a migration partially mutated data and schema rollback alone is not enough.

1. Stop JF:
   ```bash
   ssh vps 'docker stop jobfinder'
   ```

2. Drop and restore the DB:
   ```bash
   ssh vps 'docker exec pg dropdb -U postgres jobfinder'
   ssh vps 'docker exec pg createdb -U postgres -O jobfinder jobfinder'
   # Restore from latest pre-migration backup
   ssh vps 'gunzip -c /opt/docker/backups/jobfinder_pre_migration_*.sql.gz | docker exec -i pg psql -U jobfinder -d jobfinder'
   ```

3. Pin previous image (see Mode 1 step 6) and bring JF back up:
   ```bash
   ssh vps 'cd /opt/repos/vibe-studio/jf-private && docker compose -f docker-compose.prod.yml up -d --force-recreate'
   ```

## Validation after rollback

Run these to confirm a clean post-rollback state:

```bash
# Health
curl -sS https://jobfinder.example.com/api/health
# Expect: {"status":"ok","db":"ok",...}

# Migration state
ssh vps 'docker exec pg psql -U jobfinder -d jobfinder -c "SELECT count(*), bool_and(finished_at IS NOT NULL) AS all_applied FROM _prisma_migrations;"'
# Expect: count matches expected, all_applied = t

# Entrypoint ran cleanly
ssh vps 'docker logs jobfinder --tail 20 | grep -iE "entrypoint|migrate|error"'
# Expect: migrate done, no errors

# Spot-check critical column that caused original incident
ssh vps 'docker exec pg psql -U jobfinder -d jobfinder -c "\d vacancy_scores" | grep detailed_analysis'
# Expect: line showing detailed_analysis column of type jsonb
```

## Contacts / escalation

- Owner: Owner (Telegram: @yourorg)
- Pre-fix incident: 2026-05-11 — `column vacancy_scores.detailed_analysis does not exist`
- Initiative: `cmp1qpldo000401mg43fpa2wx` (Auto-apply Prisma migrations at JobFinder deploy)
- JF-MIG-01 (entrypoint fix): shipped and baselined 23 migrations in prod as of 2026-05-12
- JF-MIG-02: audit doc at `docs/audit-prisma-migrations-2026-05-11.md`
- JF compose file: `/opt/repos/vibe-studio/jf-private/docker-compose.prod.yml` (NOT `/opt/docker/docker-compose.yml`)
