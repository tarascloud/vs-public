# ADR: MemPalace forward-looking architecture review

- **Status:** Final (recommendations pending owner decision)
- **Date:** 2026-04-11
- **Author:** Architect agent
- **Ticket:** MP-ARCH-FUTURE-REVIEW
- **Scope:** services/mempalace/ post-MP-ARCH-C-08
- **Supersedes:** none (forward-looking)
- **Related:** mempalace-pgvector.md, init-palace-silent-bugs-post-mortem.md, mempalace-into-vs-monorepo.md

## TL;DR

MemPalace works and is the best long-term memory we have, but it has been alive for **14 hours** and is
validated against a 1625-drawer corpus — we are measuring a toddler. The architecture is sound for that
scale. Three things matter most before it grows past ~10k drawers:

1. **Kill the KG tables and stop pretending.** `kg_entities` and `kg_triples` have zero rows in
   production, no writer, no documented use case. They are dead weight that we dutifully back up, dump,
   and restore-drill. Either build an extractor in the next 2 weeks or drop the tables and the ADR.
2. **Enforce scrubber + metadata contracts structurally, not by discipline.** Today `scrubbed_at` is
   NULL on all 1625 rows even though the scrubber *did* run — we just never recorded it. A new ingester
   written next month that forgets to call the sidecar bypasses scrubber entirely with zero alarm.
   Fix: make `/ingest/*` the **only** write path (DB revoke INSERT from scripts), set `scrubbed_at =
   now()` in the endpoint, and add a `metadata` JSONB schema check (`meta.embedding_model` required).
3. **Pick a strategy and commit: "keep it simple" wins.** MemPalace is 800 lines of Python, one DB,
   one model, one ingest pattern. It does not need multi-model embeddings, temporal KG, or Zep. Freeze
   architecture, spend energy on the 2 structural fixes above and on ingester quality. See Part D.

**Biggest surprise:** The scrubber runs on every write but we **never persist proof** — `scrubbed_at`
column exists in the schema and is universally NULL. If a compliance auditor asked "which rows were
scrubbed and when?" we would have to answer "trust us, the audit log says so."

## Part A — Honest assessment

### Would I trust it with my own memory?

For a single-user AI augmentation (Owner's personal exocortex), **yes**, with caveats. For anything
multi-tenant or client-facing, **no** — the scrubber is discipline-enforced, not structurally enforced,
and one bad ingester leaks.

### What does 80% recall@5 still get wrong?

Looking at eval results-20260411-pgvector.md, the failing patterns are:

- **Multi-source queries** (q02 `wing room hall ChromaDB`): top-5 fills with chunks from the same big
  claude-code session because one session happens to reference all these terms. Diversify cap=2 helps
  but cannot rescue queries where the correct answer lives in vs-initiatives + vs-tasks + claude-code
  simultaneously.
- **Acronym/ID queries** (q03 `pg pgbouncer redis VPS`): `to_tsvector('simple', ...)` tokenizes the
  container names fine, but dense retrieval has no idea that "VPS" the Ryzen box is different from
  "vps" the adjective. nomic-embed-text is not great at code/ops identifiers.
- **Temporal reasoning**: "what did we decide last Tuesday about X" — impossible today. No date-range
  retrieval hook, `filed_at` is not used in ranking.
- **Entity disambiguation**: "PD" = Personal Dashboard, "pd" = database role, "Pd" = palladium. We
  just throw them in RRF and hope.

### vs alternatives

| System | vs MemPalace |
|---|---|
| **LlamaIndex** | More features, more moving parts, worse ops story for this scale. We'd replace 800 lines with 8000 lines of framework code + config. |
| **Letta (MemGPT)** | Designed for *agent* memory with summarization hierarchy. Different problem — good for long conversation context, worse as a shared historical archive. |
| **Mem0** | Hosted-first. Privacy concerns + network dependency. Has entity extraction that we lack. |
| **Zep** | Closest in scope. Temporal KG + hybrid search baked in. If we wanted temporal reasoning *today* this would be the pragmatic pick. Python/TS, Apache-2. Cost: lose pg-uniformity, gain complexity. |
| **Custom on pgvector (ours)** | What we have. Minimum moving parts. Fits the "everything in pg" VS doctrine. Weakest on KG/temporal. |

**Where mempalace stands:** minimalist sweet spot for a single-user VS-scale corpus. It will start
losing to Zep around 100k drawers or when we actually need temporal queries.

### Are wings/rooms useful?

**Mixed.** MP-FIX-20260411-05 already shrunk the taxonomy from declared 7/39 to actual 4/14 because
most rooms were never populated. Current distribution:

- `wing_workflow` 688 (claude-code + telegram)
- `wing_shuleansky` 536
- `wing_vs` 397
- `wing_pd` 4  ← underfilled, PD ingester is structurally broken

Wings do two useful things: (a) scope a search (`wing="wing_vs"`) which is cheap + effective, and
(b) constrain the hybrid retriever's diversification. A Flat layout would lose (a) which is
actually used by the MCP prompts. **Keep wings. Drop the room hierarchy**, or let it grow organically
instead of pre-declaring rooms in `init_palace.py`. We pre-declared 39, used 14.

## Part B — Latent architecture risks

Ranked by "how surprised will we be when it bites us".

### R1 — scrubbed_at is NULL on every row (HIGH)

```
SELECT count(*) FROM drawers WHERE scrubbed_at IS NOT NULL;
-- 0
```

The column exists in the schema, the scrubber runs, findings_count is audit-logged — but
`ingest_server.py::_add_chunked()` never sets `scrubbed_at`. We have **no per-row proof of scrubbing**.
In a future audit we can only point at audit.log. If a row was ingested through a bypass we'd never
know.

**Fix:** 1 line in `_add_chunked`: `"scrubbed_at": func.now()`. Backfill existing 1625 rows with the
min(filed_at) timestamp and a comment in a followup migration.

### R2 — Structural scrubber bypass risk (HIGH)

Today the social contract is: "all writes go through ingest_server.py which calls scrubber". The
structural contract is: `mempalace` pg role has `INSERT` on `drawers`. Any cron, any ingester, any
future Python script with the role's password can `INSERT ... WITHOUT` scrubbing and no one will
notice until a Kraken API key shows up in a retrieval result.

**Fix:** Create a second pg role `mempalace_writer_via_sidecar` that has INSERT; revoke INSERT from
the default `mempalace` role which only reads. The sidecar runs with the writer role. Scripts
importing `db.models` to write will get `permission denied` and have to go through the HTTP path.

### R3 — KG is structural dead weight (MEDIUM)

`kg_entities` = 0, `kg_triples` = 0. Two tables, three indexes, ~3 FKs, included in backup drill.
Referenced in ADR as "bitemporal KG" with no consumer and no extractor. The `db/kg.py` module exists
but is imported by nothing. Either:

- **(a)** Commit: build an entity+relation extractor (Ollama-based LLM call over new chunks; write
  to `kg_*` tables async) in 2 weeks. This unlocks "what do we know about X?" queries.
- **(b)** Drop: delete tables, delete `db/kg.py`, delete the KG section of ADR. Stop carrying
  vestigial complexity. Recommendation: **drop** unless a user story appears.

### R4 — Upstream `mempalace==3.1.0` package coupling (MEDIUM)

MP-ARCH-C-09 (IN_PROGRESS) forks `mempalace.mcp_server` to pg backend. Until that lands, an upstream
4.0 release with breaking changes would break MCP read path on pip upgrade. Mitigation already in
flight — just finish it.

### R5 — Ingest server is single-threaded, sync, and blocks on Ollama (MEDIUM)

FastAPI + uvicorn, single worker. Every `/ingest/*` call blocks on Ollama `/api/embed` (60s timeout).
During nightly ingest we see 15-60s per chunk. With 1625 drawers that took ~14 hours of wall time,
most of it waiting on Ollama. At 100k drawers that's a week of nightly catchup.

**Fix later (not now):** batch-embed 16 chunks per Ollama call, move to async SQLAlchemy + asyncpg,
make `/ingest/*` return 202 immediately with a job_id and process in background. For current scale
this is premature.

### R6 — Metadata JSONB has no schema; field drift incoming (MEDIUM)

Every ingester invents its own metadata keys: `hall`, `participants`, `speakers`, `type`, `title`,
`embedding_model`, …. `embedding_model` is the only universal key. In 6 months we'll want to query
"all decisions from shuleansky after date X with participant Y" and every ingester will have stored
participant in a different shape.

**Fix:** JSON Schema validation in Pydantic request models + a single registry `metadata_keys.yaml`.
Documented in a new `services/mempalace/docs/metadata-contract.md`.

### R7 — Embedding model lock-in, no upgrade runbook (MEDIUM)

`nomic-embed-text` 768d is baked into `EMBED_DIM = 768` in models.py and the pgvector column type.
Changing embedding model = re-embed all drawers + migration. There is no runbook. When a better
multilingual model appears (e.g., `bge-m3` 1024d) we'll panic-decide.

**Fix:** Write an ADR stub "embedding upgrade path" with: new column `embedding_v2 VECTOR(N)`,
shadow-write both, dual-eval, flip read side, drop old column. 2-day exercise when it matters.

### R8 — Backup restore drill validates counts, not semantics (LOW)

Drill: `pg_restore` → `SELECT count(*) FROM drawers`. A corrupted `embedding` column (all zeros, NaN,
or wrong dimension after schema evolution) would pass the drill. We've never run an eval query against
a restored backup.

**Fix:** Extend `backup/restore-test.sh` to run 1-2 eval queries from `eval/queries.yaml` against the
drill DB and assert top-1 result is non-null and has the expected source. Catches corruption that
count-checks miss.

### R9 — Nightly ingester bug idempotency failure (LOW)

If `ingest_claude_sessions.py` has a bug that writes garbage into `content`, dedup-by-source_id means
the bad row is written **once** and then permanently skipped on subsequent runs. There is no
"re-ingest with fixes" pattern — you have to manually DELETE by source_id range and re-run. No
ingester has a `--force` flag.

**Fix:** Add `--rebuild --since YYYY-MM-DD` flag to each ingester that DELETEs matching source_id
range before re-inserting. Document as the standard recovery play.

### R10 — `metadata.room` in MP-FIX-20260411-05 was declared DONE but I see no column usage

Checked: `SELECT count(*) WHERE metadata ? 'room'` — 0 rows. The ADR fix reconciled the wings/rooms
layer but didn't populate `metadata.room` anywhere. Not an active bug because `room` is also a first-
class column; just dead write-site in the declared spec. Inspect the spec or remove.

## Part C — Concrete improvements

Ten proposed tasks, ordered by priority. Full acceptance criteria inline so tasks can be inserted
verbatim.

| # | Title | Severity | Effort (agent-days) |
|---|---|---|---|
| 01 | Set `scrubbed_at` on every write + backfill | P1 | 0.5 |
| 02 | Revoke INSERT from `mempalace` role, add writer role via sidecar | P1 | 1 |
| 03 | KG decision ticket: build extractor OR drop tables | P2 | 0.5 (decision) + 2-5 (execute) |
| 04 | Restore drill runs 2 eval queries, asserts top-1 source | P2 | 0.5 |
| 05 | Metadata contract: `metadata_keys.yaml` + Pydantic validation + doc | P2 | 1 |
| 06 | Ingester `--rebuild --since` flag standard + runbook | P3 | 1 |
| 07 | Embedding upgrade path ADR + shadow-write harness | P3 | 1 |
| 08 | Async/batched `/ingest/*` when corpus > 10k drawers | P4 | 3 |
| 09 | Temporal filter on search (`filed_at_from` / `filed_at_to`) | P4 | 0.5 |
| 10 | Acronym/identifier boost: raise lexical weight in RRF for all-caps/snake tokens | P5 | 1 |

Details per ticket are inserted into VS DB as `MP-ARCH-FUTURE-NN` (below).

## Part D — Strategic direction

### The three scenarios

1. **Keep it simple** — freeze architecture, only bug fixes.
2. **Make it the memory standard** — invest heavily, become a product.
3. **Replace with upstream** — adopt Zep/Letta/LlamaIndex.

### Recommendation: **Keep it simple.**

**Why**, in order of weight:

**(1) We have one user and 1625 drawers.** Scenario 2 optimizes for a corpus and a user base we do
not have and may never have. Every hour spent on multi-model embeddings and temporal KG is an hour
not spent on the 3 real wins in Part B (scrubbed_at, role revoke, KG decision). Build for the
problem in front of you.

**(2) Replacing with upstream costs more than it saves.** Zep is the closest fit and we'd still
write adapters for 5 ingesters, 1 MCP layer, 1 backup pipeline, 1 secrets story. We'd gain temporal
KG, which we haven't actually used once in 14 hours of production, and lose pg-uniformity (which is
the biggest ops win VS has). Zep behind the scenes runs Postgres+pgvector anyway — we'd be paying
complexity tax for features we don't use yet.

**(3) The current architecture is not the bottleneck.** The bottleneck is **ingester quality** and
**contract enforcement** (Part B). Rewriting the store doesn't fix an ingester that skips scrubber.

**(4) Scenario 2 has no revenue story.** We are not selling mempalace to users. It is infrastructure
for agents. Infrastructure should be boring.

### What "keep it simple" means concretely

- Complete MP-ARCH-C-09 (fork upstream mcp_server).
- Do Part C tickets 01-05 (P1/P2). Decline everything above P3 until a real user story appears.
- Hold a quarterly review (next: 2026-07-11) that re-evaluates the three scenarios with fresh data:
  corpus size, recall, number of distinct agents reading from mempalace, eval score trend. If any
  of these pass a trigger (corpus > 50k, recall drops below 60%, > 5 agents reading, or Owner says
  "I actually need temporal queries"), escalate to Scenario 2.
- Stop adding tables. The `kg_*` pair is the canary — if in 3 weeks no one has written an extractor,
  drop them without ceremony.

### What we give up

- Temporal reasoning queries. If they become critical, we escalate to Scenario 2.
- Entity disambiguation at retrieval time. Live with it.
- Multi-tenant isolation. Not a goal.

## Part E — Process lessons

Today (2026-04-11) we shipped:
- Emergency retrofit of 15+ silent gaps (MP-FIX-* and MP-IMPROVE-* series)
- Parallel agent coordination issues (MP-INFRA-20260411-01 worktree pattern)
- Subagent sandbox bugs (MP-BUG-06, -08) blocking work for hours
- Multiple false-DONE tasks caught only by later review

MP-PROCESS-20260411-01 addressed one root cause: **machine-verifiable acceptance criteria**. That
is necessary but not sufficient. Further process changes, in priority order:

### P1 — No task goes DONE without an independent readback

The agent who writes the code is not the agent who marks DONE. Workflow:
1. Developer agent finishes work, marks task `IN_REVIEW`.
2. Architect or tester agent runs the acceptanceCriteria commands **from scratch** in a fresh
   VPS shell and pastes the output into a `readbackNote`.
3. Only then does status go DONE.

This catches false-DONE for free and has nothing to do with the developer's diligence. Cost: one
cheap re-run per task. Benefit: no more "the agent said it was done but the DB says otherwise".

### P2 — Pre-merge: "what schema did this PR touch?" gate

Any PR that adds a column, changes a JSONB field convention, or introduces a new ingester must
include a line in the commit message: `Schema impact: <one-line summary>`. CI rejects PRs to
`services/mempalace/pg/schema.sql` without this line. Pushes the "metadata drift" problem (R6)
onto the author at write-time instead of review-time.

### P3 — Nightly eval gate on retrieval quality

`eval/run_eval.py` runs in a nightly GitHub Actions workflow (or VPS cron) and posts results to
the `mp_eval_history` table. If recall@5 drops below 60% for 2 consecutive nights, the alerter
(MP-FIX-20260411-07) fires. Today we have no alarm when quality degrades — we'd notice only during
the next manual eval run.

### P4 — Weekly cross-service architect sweep

What we just did — read code, query DB, write ADR — should run every Friday, rotating service
(PD → JF → SH → mempalace → VS). Each sweep produces ≤5 P1/P2 tasks max, not 80. The discipline
is: if the sweep finds > 5 P1 issues, the previous sweep was not thorough enough, not that this
week produced more rot.

### P5 — Every new ingester ships with a runbook section in `ingest/README.md`

Sections: what it reads, what it writes, how to re-run on failure, what to delete to force
re-ingest, how to inspect state file, expected row count range. Block merge if missing. MP-FIX-04
(wing_pd underfilled) is a direct consequence of missing runbook for `ingest_pd_chat.py`.

### P6 — Explicit "no false DONE" escalation

If a task is found false-DONE after the fact, the original agent's next task is a post-mortem on
*why* the DONE was false. Not punitive — diagnostic. MP-ADR-20260411-01 is the template. One
post-mortem per incident, no exceptions. Accumulates institutional learning and makes DONE
semantically expensive, which it should be.

## Decision

Adopt Recommendation D (Keep It Simple). Insert 10 tasks (Part C) into
`mp_init_20260410` under `MP-ARCH-FUTURE-01..10`. Do not merge to main without Owner approval.

## Appendix — Ground-truth queries run

```
-- Corpus state 2026-04-11 ~14:00
SELECT count(*) FROM drawers;           -- 1625
SELECT count(*) FROM kg_entities;       -- 0
SELECT count(*) FROM kg_triples;        -- 0
SELECT count(*) FROM drawers WHERE scrubbed_at IS NOT NULL;  -- 0  ← R1
SELECT count(*) FROM drawers WHERE metadata ? 'embedding_model';  -- 1625 (only universal key)
SELECT count(*) FROM drawers WHERE metadata ? 'room';  -- 0  ← R10

-- Wing distribution (real vs declared 7)
wing_workflow    688
wing_shuleansky  536
wing_vs          397
wing_pd            4   ← underfilled

-- Size
pg_size_pretty(pg_total_relation_size('drawers')) = 12 MB
```
