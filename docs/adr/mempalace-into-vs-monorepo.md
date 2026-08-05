# ADR: MemPalace into VS Monorepo — Organizational Consolidation

- **ID:** adr/mempalace-into-vs-monorepo
- **Status:** Proposed
- **Date:** 2026-04-11
- **Owner task:** `MP-ARCH-MONO-20260411-01` (architect)
- **Initiative:** `mp_init_20260410` — MemPalace: Unified Long-Term Memory
- **Supersedes (partially):** none — co-exists with `adr/mempalace.md`
- **Related:** `adr/mempalace.md` (baseline), `MP-ARCH-C-01..08` (pgvector migration chain)
- **Author:** architect (VS)

---

## 1. Context

### 1.1 What MP-ARCH-MONO asks

Owner хоче, щоб MemPalace перестав бути "приклад-сайтом" поруч із VS і став
**повноцінною частиною monorepo** — спільний deployment pipeline, спільна БД,
спільна observability, uniform secrets, uniform CI.

### 1.2 What is actually already true (важливо не винаходити)

1. **Repo-level monorepo: ✅ already done.** `services/mempalace/` живе в
   тому ж git repo що й `app/`, `infra/`, `services/*`.
2. **Shared infra-compose: ✅ already done.** `infra/docker-compose.yml`
   містить `mempalace` service поруч з `pg`, `redis`, `vs-landing`, `pd-prod`,
   `sh`, `status` etc. Single `docker compose up` на VPS.
3. **Shared secrets pipeline: ✅ already done.** `/opt/docker/secrets/.mempalace.env`
   генерується Infisical Agent, той же що й `.pd-prod.env`, `.sh.env`.
4. **Shared PG: ✅ already done.** `pg` container — `pgvector/pgvector:pg16`.
   Extension `vector` доступна, просто `mempalace` поки її не використовує.
5. **Ingestion вже читає з VS DB.** `ingest_vs_db.py` робить `psycopg2.connect(vs)`
   і тягне initiatives/tasks/feedback у MemPalace drawers.
6. **Security baseline.** `read_only: true`, `cap_drop: ALL`, `no-new-privileges`,
   narrow secrets bind, `backend`-only network — вже застосовано (F-01..F-17).

### 1.3 What is actually **not** done

1. **Data layer: две БД.** MemPalace пише в ChromaDB SQLite у
   `/opt/docker/mempalace/palace/*.sqlite3`. PG — окрема. Backup pipeline
   дубльований, cross-table joins неможливі, single point of failure окремий
   від PG backup strategy.
2. **Runtime layer: два стеки (Python + Next.js).** `app/` — Next.js 16
   + Prisma 6 + NextAuth; `services/mempalace/` — Python 3.12 + FastAPI +
   chromadb + sentence-transformers. Немає спільного code sharing: Prisma schema
   не бачить mempalace, mempalace не бачить Prisma types.
3. **Organizational layer.**
   - `services/mempalace/` — root-level, не `services/mempalace/`. Чому? Усі
     *інші* сервіси (status, trade, website, mail, stt) живуть у `services/`.
     Це невідповідність.
   - `mempalace/docker-compose.yml` (standalone копія) **все ще існує** і розходиться
     з `infra/docker-compose.yml`. Drift risk.
   - Немає спільного lifecycle з VS API: VS Task lifecycle hook не тригерить
     MemPalace ingestion у реальному часі — все через nightly cron (`nightly.sh`).
4. **Observability.** MemPalace не поставляє метрики в `status` сервіс і не
   пише в `status` error-log PG. Solo healthcheck + audit log.
5. **CI/CD.** Немає pipeline що перевіряє `requirements.txt` змін,
   `scrubber/` unit tests, або E2E ingest при зміні `ingest_*.py`.

### 1.4 Why the original task framing is misleading

"Зробити MemPalace частиною VS monorepo" **технічно вже виконано** на рівні repo
та deployment. Правильне перефразування задачі:

> **"Усунути runtime fragmentation: ChromaDB → pgvector, single DB backup,
> VS-lifecycle hooks, uniform services/ layout, shared observability."**

Це робить MONO-01 **organizational coordinator** над набором технічних міграцій,
а не самостійний monolithic plan.

---

## 2. Decision

### 2.1 Short answer per Open Question

| # | Question | Decision |
|---|----------|----------|
| 1 | Monorepo layout | **Option B modified:** `services/mempalace/` (move from root). Python залишається Python. Жодного port-на-TypeScript. |
| 2 | DB consolidation | **Single `vs` DB + dedicated schema `mempalace`.** pgvector у PG16 (вже є). Мержимо з ARCH-C; НЕ створюємо окрему `mempalace` DB. |
| 3 | Deployment | **Split containers, shared compose.** `vs-landing` (Next.js) + `mempalace` (Python) як зараз. Заборонити bundling у один image. |
| 4 | Ingester layer | **Keep Python.** Lifecycle тригеринг з Next.js через HTTP webhook до `mempalace` FastAPI (`POST /ingest/*`) — вже API контракт існує. |
| 5 | MCP server | **Залишити Python MCP server.** Next.js НЕ експонує `/mcp`. Access з Mac — existing SSH forced-command. |
| 6 | Migration path | **Staged, parallel run.** (a) pgvector read-write у тіньовому режимі, (b) cutover MCP reads, (c) freeze Chroma, (d) delete Chroma. Без hot cutover. |
| 7 | Relation до MP-ARCH-C | **ARCH-C = technical spine of MONO-01.** MONO-01 НЕ дублює ARCH-C; MONO-01 = parent що координує ARCH-C + org tasks. |

### 2.2 Обґрунтування ключових виборів

**Чому НЕ порт на TypeScript.** `mempalace>=3.1.0` — upstream PyPI package,
`chromadb`, `sentence-transformers`, `rank-bm25`, `mcp-proxy` — все Python
native, немає прямих JS analogues. Переписати = форкнути upstream, втратити
benchmarks LongMemEval 96.6% R@5, взяти повну підтримку scrubber/patterns на
себе. Effort estimate: 4-6 тижнів розробки + regression risk. ROI negative.

**Чому НЕ окрема `mempalace` DB.** Дві БД на одному `pg` = два backup scopes,
два credentials, два PgBouncer pools — складніше, а ізоляція дає марно (single
tenant, одна людина — Owner). Дедікована `schema mempalace` у `vs` DB дає всі
переваги (logical namespace, separate search_path, окремий role), без
подвоєного maintenance.

**Чому `services/mempalace/`.** Consistency. `services/status/`, `services/trade/`,
`services/website/`, `services/cloudflare/`, `services/mail/`, `services/stt/`
— всі living в `services/`. `mempalace/` у корені — історична аномалія від
Wave 1 (коли він народжувався як side-project). Перенесення fix-up = symlink
+ compose build context update + sed по 3-4 файлах.

**Чому залишити split containers.** Bundling Python workload (venv ~500 MB +
HF cache ~80 MB + sentence-transformers model ~100 MB) у `vs-landing` (Next.js
standalone output ~200 MB) подвоює image size, ламає `read_only: true` для
Next.js, ламає security hardening профіль MemPalace (окремий UID 1000,
окремий cap_drop), робить `docker compose restart vs-landing` болючим (пере-
завантаження embedding моделі). Split = безпечніше, granular restart, окремий
мемлимит.

**Чому staged migration, не hot cutover.** MemPalace тримає ~230 MB drawers +
~90 MB Chroma index; reingest на pgvector займає 0.5-2 sec per memory × ~30k
memories ≈ 4-16 годин CPU на Ryzen 5500U. Hot cutover = 16-годинне вікно
downtime MCP. Staged parallel run = zero downtime, rollback trivially через
feature flag `MEMPALACE_BACKEND=chroma|pgvector`.

### 2.3 Relation to MP-ARCH-C (**merge, не sequence**)

ARCH-C вже розв'язує:
- C-01 pgvector schema (шукає `vs.mempalace_*` tables)
- C-02 embedding storage migration
- C-03 scrubber invariants під pgvector
- C-04 search tool refactor (cosine over pgvector)
- C-05 ingester retarget
- C-06 Chroma → pgvector dump/load
- C-07 rollback/feature flag
- C-08 cleanup старих drawers

MONO-01 додає **над ARCH-C** тільки organizational sub-tasks — не технічні:

- **MP-MONO-01** — move `mempalace/` → `services/mempalace/` + update build contexts
- **MP-MONO-02** — delete `services/mempalace/docker-compose.yml` drift (standalone stale copy)
- **MP-MONO-03** — schema `mempalace` у `vs` DB + role `mempalace` + grant
- **MP-MONO-04** — wire VS Task lifecycle → mempalace webhook (Next.js → FastAPI)
- **MP-MONO-05** — add mempalace metrics to `status` service (collector)
- **MP-MONO-06** — backup pipeline unified (drop separate tar, pg_dump бере все)
- **MP-MONO-07** — CI: lint + scrubber unit tests on mempalace PR
- **MP-MONO-08** — docs cleanup: merge CLAUDE.md/MemPalace sections, remove dup

ARCH-C виконується **всередині** MONO-01 як child chain, з hard dependency:
- MP-MONO-03 **блокує** ARCH-C-01 (schema must exist first).
- MP-MONO-06 **блокований** ARCH-C-08 (cleanup старих drawers перед backup reunification).

---

## 3. Consequences

### 3.1 Positive

- **Single backup job.** `pg_dump vs` бере усе: tasks, initiatives, feedback, mempalace memories, embeddings, KG edges. Restore drill simpler.
- **SQL joins across domains.** `SELECT m.content FROM mempalace.memory m JOIN "Task" t ON m.source_id = t."ticketId"` — можливо без cross-DB hack.
- **Drift elimination.** Standalone `mempalace/docker-compose.yml` стає один source of truth (`infra/docker-compose.yml`).
- **Observability uniformity.** Status service вже моніторить всі сервіси — mempalace недобігає, і це lacuna.
- **Real-time ingestion.** VS Task DONE → webhook → mempalace event, замість 24h cron затримки.
- **Services/ consistency.** Розкладка monorepo стає predictable для нових агентів.

### 3.2 Negative / costs

- **pgvector benchmark risk.** LongMemEval 96.6% R@5 виміряно на Chroma. pgvector cosine search з ivfflat/hnsw може дати різні цифри. ARCH-C-04 має перевірити regression (acceptance: ≥90% R@5 на тому самому test set).
- **Embedding storage footprint.** 384-dim float32 embedding × 30k memories × 1.5 KB = ~45 MB у таблиці + ivfflat index ~20 MB. Прийнятно.
- **PG contention.** Ingest bursts (nightly 04:45) можуть конкурувати з pd-prod read traffic. Mitigation: `maintenance_work_mem=2GB` вже налаштовано; ingester wraps у `SET LOCAL statement_timeout=30s` і yields.
- **Python залишається** — не досягаємо "uniform TS stack" мрії. Прийнятна trade-off (див. §2.2).
- **SchemaMigration coupling.** `app/prisma/schema.prisma` (наразі Prisma) і raw SQL mempalace schema потрібно тримати координовано. Pragmatic: Prisma не touches `mempalace` schema, mempalace не touches `public`. Introspection disabled на mempalace schema.

### 3.3 Ризики

| # | Ризик | Ймовірність | Impact | Mitigation |
|---|-------|-------------|--------|------------|
| R1 | pgvector recall regression >6% | Medium | High | Acceptance в ARCH-C-04; rollback flag |
| R2 | Migration duration з parallel run переповнює диск | Low | Medium | 73 GB free, усі дані ~320 MB → +100 MB копія ОК |
| R3 | Нова schema ламає existing ingesters | Medium | Medium | Staged: ARCH-C-05 переписує ingesters з двома backends одночасно |
| R4 | `services/mempalace/` move ламає cron paths на VPS | High | Low | Обов'язково `git mv` + update `nightly.sh` paths у одному коміті + pin verification command |
| R5 | `status` collector для pgvector latency шумить | Low | Low | Noise budget у `status` службі, disable if flaky |

---

## 4. Alternatives Considered

### 4.1 Alt A: Повний port на TypeScript

Переписати ingest_server.py + ingesters + scrubber на Next.js app. MCP через
`/mcp` route. Chromadb → pgvector.

- **Effort:** 4-6 тижнів ФТЕ.
- **Pros:** uniform stack, shared types через Prisma, no Python in repo.
- **Cons:** втрата upstream `mempalace` PyPI (open-source fork burden);
  sentence-transformers JS аналоги (Transformers.js) 3-5x повільніше на CPU;
  втрачаємо 1569 рядків рекомендованого коду; MCP server reimplementation.
- **Verdict:** REJECTED — ROI negative.

### 4.2 Alt B: Separate `mempalace` DB on same `pg` instance

Окрема PG БД `mempalace` з окремим role, окремий `pg_dump`.

- **Pros:** strict isolation, незалежні backups, незалежний restore drill.
- **Cons:** два pool-и у PgBouncer, два secret-sets, cross-DB joins неможливі
  без postgres_fdw (overhead).
- **Verdict:** REJECTED у favor of schema-per-module у одній DB.

### 4.3 Alt C: Single bundled Docker image (Next.js + Python)

Multi-stage Dockerfile: stage1 Python venv, stage2 Next.js build, final =
Alpine з обома runtime.

- **Pros:** одна команда білд, одна команда deploy.
- **Cons:** див §2.2 про split containers. Destroys security hardening, doubles
  image size, couples restart cycle.
- **Verdict:** REJECTED.

### 4.4 Alt D: pnpm workspace + turbo

Розбити monorepo на packages/, workspace, turborepo cache.

- **Pros:** сучасний TS monorepo layout.
- **Cons:** Python не є частиною pnpm workspace; VS має лише один TS package
  (`app/`) — overkill; додає build complexity.
- **Verdict:** REJECTED для current scale. Revisit якщо `app/` розростеться до
  3+ TS packages.

### 4.5 Alt E: Status quo — не робити нічого

Залишити ChromaDB, standalone deployment, cron-only ingestion.

- **Pros:** zero work.
- **Cons:** зберігається два backup job-и, немає real-time lifecycle, drift у
  docker-compose копіях, services/ inconsistency.
- **Verdict:** REJECTED — accrued debt грає проти нас з часом.

---

## 5. Migration Plan

### 5.1 Phases (timeline estimate: 3-4 тижні wall-clock, 8-10 агент-днів effort)

**Phase 0 — Prep (0.5 day).** Merge цей ADR, створити sub-tasks (MONO-01..08 + pin ARCH-C dependencies).

**Phase 1 — Org refactor (1 day).** MONO-01 (git mv), MONO-02 (delete drift compose), MONO-08 (docs). Без runtime ризиків. Перевірка: `docker compose config` працює, no-op для running контейнерів.

**Phase 2 — DB schema (1 day).** MONO-03 (schema + role + grants). Порожня schema, writes туди ще ніхто не робить. Перевірка: `\dn` показує `mempalace`, `psql -U mempalace -d vs` з'єднується.

**Phase 3 — Technical spine (ARCH-C-01..08, ~5-6 days).** pgvector migration per existing chain. Gated by Phase 2.

**Phase 4 — Lifecycle wiring (1 day).** MONO-04 (VS Task → mempalace webhook). Only after pgvector live.

**Phase 5 — Observability (0.5 day).** MONO-05 (status collector). Independent.

**Phase 6 — Backup unification (0.5 day).** MONO-06. Gated by ARCH-C-08 (стара Chroma drawers видалені).

**Phase 7 — CI (0.5 day).** MONO-07. Паралельно з Phase 1+.

### 5.2 Rollback Plan

- **Phase 1 revert**: `git revert` move commit; compose build context auto-resolves.
- **Phase 2 revert**: `DROP SCHEMA mempalace CASCADE;` (empty, harmless).
- **Phase 3 revert**: feature flag `MEMPALACE_BACKEND=chroma`. Switch container env, restart. Chroma files still on disk during parallel window.
- **Phase 4 revert**: disable webhook route у Next.js, flip to cron-only.
- **Phase 5 revert**: видалити collector file, rebuild status.
- **Phase 6 revert**: reinstate tar job у cron.
- **Phase 7 revert**: disable workflow у `.github/workflows/`.

**Hard gate**: Phase 3 parallel run триває **мінімум 7 днів** перед видаленням Chroma. Це дає buffer для recall regression detection.

### 5.3 Relationship to MP-ARCH-C

ARCH-C **не розривається** і **не переписується**. MONO-01 додає parent
Initiative (can be same `mp_init_20260410` або новий `mp_init_mono_20260411`)
і hard dependencies:

```
MP-MONO-01 (move layout) ──────┐
MP-MONO-02 (drift compose) ────┤
MP-MONO-03 (pg schema) ────────┼──► MP-ARCH-C-01 ── ... ──► MP-ARCH-C-08 ──┐
MP-MONO-07 (CI) ────────────────┘                                           │
                                                                            ▼
                              MP-MONO-04 (webhook)  MP-MONO-05 (metrics)  MP-MONO-06 (backup)
                                                                            ▲
                                                               MP-MONO-08 (docs) ── final
```

---

## 6. Effort Estimate

- **Wall-clock:** 3-4 тижні (staged, parallel run buffer 7 days)
- **Agent-days effort:** 8-10 днів (разом з ARCH-C; з них MONO overhead ~3 дні)
- **Risk-adjusted:** +30% на pgvector recall tuning + migration dry-runs

**Чи задача має економічний сенс?** Так, але **тільки** якщо ARCH-C все одно
виконується. Без pgvector міграції MONO-01 — chrome polish (переніс папок,
чистка drift, CI), яка коштує ~3 дні і дає низький ROI. Разом з ARCH-C — це
природна організаційна обгортка, 0.5-1 agent-day overhead, високий ROI (
unified backup + lifecycle + consistency).

**Рекомендація:** MONO-01 і ARCH-C виконувати **разом, як одна ініціатива**.
Якщо Owner вирішить відкласти ARCH-C — відкласти і MONO-01, бо ізольована
реорганізація layout без pgvector = premature rearranging.

---

## 7. Open Questions (for future waves)

- **Q1.** Чи створювати окремий `mp_init_mono_20260411` Initiative або переіспользувати `mp_init_20260410`? → Recommended: reuse — це той самий MemPalace scope.
- **Q2.** Чи міняти назву `wing_*` / `room_*` (в MemPalace term) на щось SQL-friendly? → Ні, MemPalace API stable.
- **Q3.** Чи експонувати mempalace search у VS studio UI (Next.js page)? → Out of scope MONO-01, може бути v2 Wave.
- **Q4.** HNSW vs ivfflat index для pgvector? → ARCH-C-04 benchmark decision.
- **Q5.** Python 3.12 runtime upgrade до 3.13? → Незалежне питання, не блокує.

---

## 8. References

- Baseline ADR: `docs/adr/mempalace.md`
- Security review: `docs/security/mempalace-review-20260410.md`
- pgvector docs: https://github.com/pgvector/pgvector
- ARCH-C chain: VS Task search `ticketId LIKE 'MP-ARCH-C-%'`
- MemPalace upstream: https://github.com/milla-jovovich/mempalace
- Existing `infra/docker-compose.yml` mempalace service definition: L631-678

---

## 9. Decision Log

- **2026-04-11** — ADR proposed (MP-ARCH-MONO-20260411-01, architect).
- **Next review:** після ARCH-C-04 benchmark results (go/no-go для pgvector cutover).
