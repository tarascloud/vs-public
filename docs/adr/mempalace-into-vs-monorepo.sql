-- MP-ARCH-MONO-20260411-01 — sub-tasks creation
-- Run on VPS: ssh vps 'docker exec -i pg psql -U vs -d vs' < this.sql
-- Reference ADR: docs/adr/mempalace-into-vs-monorepo.md
-- MP-PROCESS-01 compliant: acceptanceCriteria NOT NULL, verificationCommand where possible

BEGIN;

-- ── 1. Insert sub-tasks ──────────────────────────────────────────────────────

INSERT INTO "Task" (
  "ticketId", "initiativeId", title, description, type, priority, status,
  "assigneeType", "agentName", "acceptanceCriteria", "verificationCommand",
  "createdAt", "updatedAt"
) VALUES

-- MP-MONO-01 — Move mempalace to services/
('MP-MONO-01', 'mp_init_20260410',
 'Move mempalace/ → services/mempalace/',
 'Organizational: align with services/status, services/trade, services/website layout. git mv, update build contexts in infra/docker-compose.yml, update paths in ingest/nightly.sh, CLAUDE.md rule references, docs.',
 'CHORE'::"TaskType", 6, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'developer',
 E'- git mv mempalace services/mempalace\n- infra/docker-compose.yml mempalace.build.context points to new path OR image still prebuilt\n- nightly.sh references updated\n- VPS cron still fires nightly ingest successfully\n- docker compose config passes\n- No broken symlinks',
 'cd /opt/repos/vibe-studio && docker compose -f infra/docker-compose.yml config >/dev/null && ls services/mempalace/Dockerfile && ! ls mempalace 2>/dev/null',
 NOW(), NOW()),

-- MP-MONO-02 — Delete drift docker-compose.yml
('MP-MONO-02', 'mp_init_20260410',
 'Delete mempalace/docker-compose.yml drift copy',
 'Standalone docker-compose.yml in mempalace/ is a stale historic copy that diverges from infra/docker-compose.yml. Delete to enforce single source of truth.',
 'CHORE'::"TaskType", 5, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'developer',
 E'- services/mempalace/docker-compose.yml (or root mempalace/docker-compose.yml) deleted\n- No references remain in scripts or docs\n- infra/docker-compose.yml remains the only compose with mempalace service',
 'cd /opt/repos/vibe-studio && ! find services/mempalace mempalace -name docker-compose.yml 2>/dev/null | grep -q .',
 NOW(), NOW()),

-- MP-MONO-03 — Postgres schema mempalace
('MP-MONO-03', 'mp_init_20260410',
 'Create pg schema mempalace + role + grants in vs DB',
 'Create dedicated namespace for MemPalace tables inside the shared vs database. Prerequisite for ARCH-C-01 (pgvector schema). Schema mempalace, role mempalace with USAGE/CREATE, CREATE EXTENSION IF NOT EXISTS vector.',
 'FEATURE'::"TaskType", 8, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'devsecops',
 E'- CREATE SCHEMA mempalace AUTHORIZATION mempalace\n- CREATE ROLE mempalace LOGIN PASSWORD from Infisical\n- GRANT USAGE, CREATE ON SCHEMA mempalace TO mempalace\n- CREATE EXTENSION IF NOT EXISTS vector (idempotent)\n- mempalace role cannot read public.* (task table) — test with explicit SELECT denied\n- Credentials stored in Infisical project mempalace env prod',
 'ssh vps ''docker exec pg psql -U postgres -d vs -tAc "SELECT nspname FROM pg_namespace WHERE nspname=''"''"''mempalace''"''"''" | grep -q mempalace && docker exec pg psql -U postgres -d vs -tAc "SELECT extname FROM pg_extension WHERE extname=''"''"''vector''"''"''" | grep -q vector''',
 NOW(), NOW()),

-- MP-MONO-04 — VS Task lifecycle → mempalace webhook
('MP-MONO-04', 'mp_init_20260410',
 'Wire VS Task lifecycle → mempalace ingest webhook',
 'Real-time ingestion: when a Task transitions to DONE (or gets completionNote/commitHash), Next.js /api/tasks/[id] PUT handler fires POST to mempalace FastAPI /ingest/decision. Replaces nightly cron delay for VS DB events.',
 'FEATURE'::"TaskType", 7, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'developer',
 E'- app/src/app/api/tasks/[id]/route.ts PUT handler calls mempalace webhook on DONE transitions\n- Uses MEMPALACE_INGEST_URL + MEMPALACE_BEARER_TOKEN from env\n- Failures are non-blocking (log + continue), do not break task PUT\n- Auth via timing-safe bearer comparison\n- E2E test: PUT task DONE → webhook hit, memory searchable in mempalace within 5s\n- ingest_vs_db.py nightly keeps running as fallback/backfill',
 'cd app && npx playwright test tests/e2e/mempalace-webhook.spec.ts',
 NOW(), NOW()),

-- MP-MONO-05 — Status collector for mempalace
('MP-MONO-05', 'mp_init_20260410',
 'Add mempalace health/metrics collector to status service',
 'services/status currently monitors pd-prod, pd-dev, website, freqtrade, jobfinder, etc, but not mempalace. Add collector: container up/down, /health endpoint, drawer count, chroma/pgvector backend, last nightly ingest success timestamp.',
 'FEATURE'::"TaskType", 5, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'developer',
 E'- New Go collector in services/status/collectors/mempalace.go\n- Reports: container_up, health_status, drawer_count, last_nightly_ingest_at, backend=chroma|pgvector\n- Visible on https://status.example.com\n- No secrets written in logs',
 'curl -sf https://status.example.com/api/services | jq ''.services[] | select(.name=="mempalace")''',
 NOW(), NOW()),

-- MP-MONO-06 — Unified backup pipeline
('MP-MONO-06', 'mp_init_20260410',
 'Unify backup: drop separate mempalace tar, pg_dump covers everything',
 'Once ARCH-C-08 removes Chroma SQLite drawers, mempalace state lives entirely in pg:vs schema mempalace. Drop /opt/docker/scripts/mempalace-backup.sh tar job. Rely on nightly pg_dump vs at 03:00 which now covers mempalace. Single restore drill.',
 'CHORE'::"TaskType", 6, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'devsecops',
 E'- crontab -l does not show mempalace-backup.sh\n- /opt/docker/backups/mempalace_*.tar.gz no longer produced after cutover\n- pg_dump vs includes mempalace schema (grep mempalace. in latest dump)\n- Restore drill documented in docs/adr/mempalace-into-vs-monorepo.md or separate runbook\n- Raw drawers backup (markdown files) still archived if any remain, else removed',
 'ssh vps ''gunzip -c $(ls -t /opt/docker/backups/vs_*.sql.gz | head -1) | grep -q "SET search_path = mempalace"''',
 NOW(), NOW()),

-- MP-MONO-07 — CI for mempalace
('MP-MONO-07', 'mp_init_20260410',
 'CI pipeline: scrubber unit tests + requirements lint on mempalace PR',
 'Add GitHub Actions (or equivalent) workflow that on push to services/mempalace/**: (a) installs requirements.txt, (b) runs scrubber pytest, (c) lints ingest_server.py with ruff or pylint, (d) scans for hardcoded secrets. Prevents scrubber regressions.',
 'CHORE'::"TaskType", 4, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'devsecops',
 E'- .github/workflows/mempalace-ci.yml exists\n- Runs on paths: services/mempalace/**\n- pytest scrubber/tests passes on CI\n- ruff check passes\n- gitleaks or equivalent secret scan passes\n- Workflow visible in PR checks',
 'cd /opt/repos/vibe-studio && test -f .github/workflows/mempalace-ci.yml && grep -q mempalace .github/workflows/mempalace-ci.yml',
 NOW(), NOW()),

-- MP-MONO-08 — Docs cleanup
('MP-MONO-08', 'mp_init_20260410',
 'Docs consolidation: merge MemPalace sections in CLAUDE.md / rules',
 'After reorg, several docs reference mempalace: CLAUDE.md (MemPalace section), .claude/rules/*.md, services/mempalace/docs/*. Consolidate: single canonical reference (ADR), update paths from mempalace to services/mempalace, fix stale port/schema references.',
 'CHORE'::"TaskType", 3, 'TODO'::"TaskStatus", 'AGENT'::"AssigneeType", 'developer',
 E'- CLAUDE.md MemPalace section points to services/mempalace/\n- .claude/rules/*.md paths updated\n- docs/adr/mempalace.md gets "Superseded-in-part by mempalace-into-vs-monorepo.md" note\n- grep -r "mempalace/" returns zero matches in docs (only in git history)',
 'cd /opt/repos/vibe-studio && ! grep -rn "mempalace/" CLAUDE.md .claude/rules docs 2>/dev/null | grep -v "\.git/" | grep -v "mempalace-into-vs-monorepo"',
 NOW(), NOW());

-- ── 2. Dependency graph ──────────────────────────────────────────────────────
-- _TaskDependencies: (A, B) means A is blocked by B

INSERT INTO "_TaskDependencies" ("A", "B") VALUES
  -- MP-MONO-01 (move) blocks MP-MONO-02 (delete drift) — cleaner if move first
  ('MP-MONO-02', 'MP-MONO-01'),
  -- MP-MONO-03 (pg schema) blocks ARCH-C-01 (schema required for pgvector tables)
  ('MP-ARCH-C-01', 'MP-MONO-03'),
  -- MP-MONO-04 (webhook) depends on ARCH-C-08 (pgvector cutover done, webhook writes go to pgvector)
  ('MP-MONO-04', 'MP-ARCH-C-08'),
  -- MP-MONO-05 (status collector) independent of ARCH-C but prefers move done (correct paths)
  ('MP-MONO-05', 'MP-MONO-01'),
  -- MP-MONO-06 (unified backup) requires ARCH-C-08 (Chroma removed)
  ('MP-MONO-06', 'MP-ARCH-C-08'),
  -- MP-MONO-07 (CI) depends on move (paths)
  ('MP-MONO-07', 'MP-MONO-01'),
  -- MP-MONO-08 (docs) is final cleanup
  ('MP-MONO-08', 'MP-MONO-01'),
  ('MP-MONO-08', 'MP-MONO-06'),
  ('MP-MONO-08', 'MP-ARCH-C-08');

-- ── 3. Mark parent task MP-ARCH-MONO-20260411-01 as DONE ──────────────────────
-- Run this AFTER git commit is ready; fill :commit_hash placeholder

-- UPDATE "Task" SET
--   status='DONE'::"TaskStatus",
--   "completedAt"=NOW(),
--   "commitHash"=':commit_hash',
--   "verificationStatus"='NO_RUNTIME'::"VerificationStatus",
--   "verificationOutput"=E'ADR delivered: docs/adr/mempalace-into-vs-monorepo.md\nSub-tasks: MP-MONO-01..08 (8 total)\nDependencies linked via _TaskDependencies\nRelationship to ARCH-C: MONO = organizational parent, ARCH-C = technical spine',
--   "verifiedAt"=NOW(),
--   "completionNote"='ADR proposes: services/mempalace reorg, schema mempalace in vs DB, split containers retained, pgvector via ARCH-C merged as child chain, staged parallel-run migration, unified backup via pg_dump. Recommend merging MONO-01 with ARCH-C execution.',
--   "updatedAt"=NOW()
-- WHERE "ticketId"='MP-ARCH-MONO-20260411-01';

COMMIT;
