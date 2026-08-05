# MemPalace embedding upgrade path (shadow-write harness)

**ADR:** MP-ARCH-FUTURE-07
**Date:** 2026-04-11
**Status:** Accepted — procedural, no code changes
**Decision driver:** Owner

## Purpose

Document the exact procedure for swapping MemPalace's embedding model. Today's stack uses Ollama `nomic-embed-text` (768 dimensions, multilingual). This ADR is the runbook for future upgrades so the swap is routine, reversible, and measured — not a weekend adventure.

## Current baseline

| Property | Value |
|----------|-------|
| Model | `nomic-embed-text` (Ollama) |
| Dimensions | 768 |
| Distance | cosine |
| Host | `ollama` container on VPS, `http://ollama:11434/api/embed` |
| Code | `services/mempalace/db/embedder.py` — `OllamaEmbedder.dim = 768` hardcoded |
| Schema | `services/mempalace/db/models.py` — `EMBED_DIM = 768`, `Drawer.embedding: Vector(768)` |
| Schema DDL | `services/mempalace/pg/schema.sql` — `embedding VECTOR(768) NOT NULL` |
| Index | `drawers_embedding_ivfflat` — ivfflat cosine, lists=10 (C-08 tuning pending) |
| Corpus size | ~1625 drawers (as of 2026-04-11) |
| Re-embed cost | ~1625 × 100 ms ≈ 2.7 minutes wall time on Ollama |

## When to upgrade

Only when **at least one** trigger fires:

1. **Benchmark delta** — a newer multilingual sentence embedding model beats `nomic-embed-text` by ≥5 pp on the MemPalace eval set (see Benchmark protocol below). Hype on Twitter is not a trigger.
2. **Operational** — Ollama drops `nomic-embed-text`, or a security CVE forces replacement.
3. **Cost/latency** — a provider offers a strictly smaller model (≤384d) with ≤3 pp recall drop and ≥2× throughput, and we are measurably bottlenecked.
4. **Dimensionality need** — a rerank/quantization technique requires a specific dimension (e.g. Matryoshka embeddings).

Upgrades costing more than 2 hours of operator attention require a new initiative, not an ad-hoc change.

## Shadow-write harness design

Goal: eval both embedders against **production traffic** for 2 weeks before promoting, with instant rollback.

### Phase 1 — shadow column (day 0)

1. Migration `pg/migrations/YYYYMMDD_add_embedding_v2.sql`:
   ```sql
   ALTER TABLE drawers ADD COLUMN embedding_v2 VECTOR(N) NULL;
   -- NULL allowed during backfill window
   CREATE INDEX drawers_embedding_v2_ivfflat
       ON drawers USING ivfflat (embedding_v2 vector_cosine_ops) WITH (lists=10);
   ```
2. Extend `OllamaEmbedder` to accept a `variant` arg: `primary` (old) or `shadow` (new). Inject both via `models.py` / `embedder.py`.
3. **Dual-write** in ingest path (`services/mempalace/db/ingest.py` or wherever rows are inserted):
   - Compute both vectors for every new drawer.
   - Write `embedding` (old) + `embedding_v2` (new) in the same `INSERT`.
   - If new embedder fails: log + continue with NULL for `embedding_v2`, never block ingest.

### Phase 2 — backfill (day 0–1)

Script `services/mempalace/pg/backfill_embedding_v2.py`:
```python
# pseudo — batch 100 drawers, compute v2 embeddings, UPDATE
for batch in paginate(Drawer, where=Drawer.embedding_v2.is_(None), size=100):
    texts = [d.content for d in batch]
    vecs = shadow_embedder.embed(texts)
    bulk_update(batch, embedding_v2=vecs)
```
~1625 rows × 100 ms ≈ 3 min. Run on VPS, log to backup volume.

### Phase 3 — parallel eval (day 1–14)

Every time `hybrid_search` runs, also run a shadow search against `embedding_v2`:
1. Log to `search_shadow_eval` table: query text, primary top-10 IDs, shadow top-10 IDs, overlap, timestamps.
2. Nightly job computes aggregate metrics:
   - **Jaccard@10** — overlap of top-10 sets per query
   - **Kendall tau** — rank correlation where they do overlap
   - **Human-labeled eval set** (see below) — recall@10, MRR, NDCG@10
3. Weekly report to Telegram + `docs/adr/embedding-eval-report-YYYY-MM.md`.

### Phase 4 — promotion (day 14+)

If shadow wins on the eval set by ≥5 pp with no operational regressions:

1. Rename columns: `ALTER TABLE drawers RENAME COLUMN embedding TO embedding_v1_legacy; ALTER TABLE drawers RENAME COLUMN embedding_v2 TO embedding;`
2. Update `models.py`: `EMBED_DIM = N`, `Vector(N)`.
3. Update `embedder.py`: default model/dimension.
4. Drop old index + column after 7 more days of quarantine:
   ```sql
   DROP INDEX drawers_embedding_ivfflat_legacy;
   ALTER TABLE drawers DROP COLUMN embedding_v1_legacy;
   ```
5. Close feedback loop: add to `MEMORY.md`, update this ADR's "baseline" table.

### Rollback (any phase)

- Phase 1–3 (dual-write): `ALTER TABLE drawers DROP COLUMN embedding_v2;` + revert ingest code. Zero impact on production search.
- Phase 4 (post-promotion, within 7-day quarantine): rename columns back, revert embedder. Old vectors still in `embedding_v1_legacy`.
- Phase 4 (post-quarantine): re-backfill from scratch using the old model. Cost: ~3 minutes, same as forward migration. Not free but not painful.

**Never** promote without a 7-day quarantine of the old column.

## Benchmark protocol

**Eval set must exist before any upgrade is attempted.** If we upgrade without one, we are guessing.

### Building the eval set (one-time, prerequisite)

1. Sample 50 real queries from `search_shadow_eval` (or logs of `mempalace_search` usage) — mix of Ukrainian, English, short, long, factual, conceptual.
2. For each query, Owner manually labels the 10 drawers he would want to see (from the full corpus). Stored in `services/mempalace/eval/queries.jsonl`:
   ```json
   {"query": "who runs pd scheduler", "relevant": ["drawer_id_1", "drawer_id_5", ...], "notes": "..."}
   ```
3. Baseline: measure recall@10, MRR, NDCG@10 for the **current** model. Record in `services/mempalace/eval/baseline.json`.

### Acceptance criteria for a new embedder

A candidate model may be promoted iff:

1. **Recall@10** on the 50-query eval set is within 5 pp of baseline — either direction (strictly, a new model MUST NOT regress by more than 5 pp on any individual language subset).
2. **Kendall tau ≥ 0.6** with baseline on the ≥20 queries where the top-10 sets overlap significantly (smoke test: "it's still semantically ranking similar things").
3. **P95 embed latency** within 2× baseline. Not paying 5× latency for 2 pp recall gain.
4. **Qualitative review** — Owner scrolls 10 random new top-10 results and doesn't see obvious regressions.

If any criterion fails: abort, document in the eval report, leave shadow column in place until next attempt or drop it.

## Code change surface (for the future operator)

When you execute a promotion, these are the files to touch:

| File | Change |
|------|--------|
| `services/mempalace/db/embedder.py` | `DEFAULT_MODEL`, `dim` property |
| `services/mempalace/db/models.py` | `EMBED_DIM`, `Drawer.embedding` Vector size |
| `services/mempalace/pg/schema.sql` | `VECTOR(N)` for fresh installs |
| `services/mempalace/pg/migrations/YYYYMMDD_*.sql` | column add/backfill/rename/drop |
| `services/mempalace/db/ingest.py` | dual-write logic (phase 1) / single-write (phase 4) |
| `services/mempalace/db/search.py` | no change — `dense_search` calls `cosine_distance` against `Drawer.embedding` regardless of dim |
| `services/mempalace/pg/backfill_embedding_v2.py` | one-shot backfill script (phase 2) |
| `services/mempalace/eval/queries.jsonl` | eval set (exists before upgrade) |
| `services/mempalace/eval/baseline.json` | baseline metrics |
| `infra/scripts/mempalace-restore-test.sh` | update drill eval queries if vocabulary changes |

## Data migration cost reference

| Corpus size | Re-embed wall time (nomic-embed-text, 100 ms/row) |
|-------------|---------------------------------------------------|
| 1,625 (today) | 2.7 min |
| 10,000 | 16.7 min |
| 50,000 | 83 min |
| 500,000 | ~14 h (needs batching + parallelism) |

As long as the corpus stays under ~20k drawers, backfill is trivial and can run in a single `tmux` session during low-traffic hours. Above that, the backfill script needs batching + resumability (already designed in Phase 2 — NULL filter makes it idempotent).

## What we are not deciding today

- Which model to pick next. (No trigger yet.)
- Whether to move off Ollama. (Current deployment is fine.)
- Whether to use Matryoshka or quantized embeddings. (Requires its own ADR.)
- Whether to split multilingual into per-language embedders. (Premature.)

## Related

- MP-ARCH-C-04 — hybrid retrieval design (dense + lexical RRF)
- MP-ARCH-C-08 — reranker + diversification tuning
- MP-ARCH-FUTURE-REVIEW — flagged "embedding upgrade is routine, write the runbook"
- MP-ARCH-FUTURE-03 — KG drop (sibling task)
- MP-ARCH-FUTURE-04 — restore drill eval queries (sibling task)
