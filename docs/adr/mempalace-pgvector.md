# ADR: MemPalace pgvector migration

- **Status:** Proposed (in progress — chain MP-ARCH-C-01..C-08)
- **Date:** 2026-04-11
- **Deciders:** @owner, architect agent
- **Ticket:** MP-ARCH-C-01
- **Supersedes:** ADR draft `mempalace-into-vs-monorepo.md` (vector-store section)

## Context

MemPalace today stores vectors in **ChromaDB persistent client** (`/data/palace/chroma.sqlite3`)
and a separate **knowledge graph in SQLite** (`/data/palace/knowledge_graph.sqlite3`).
Current corpus: **1643 drawers**, embedding model `nomic-embed-text` (768d), Ollama on VPS.

Pain points:

1. **SEC-01 dual writer risk** — Chroma embedded mode is single-process; the FastAPI ingest server
   and the MCP server both used to open it. We mitigated by funneling writes through the ingest
   sidecar, but the architectural footgun remains.
2. **SQLite limitations** — Chroma uses SQLite under the hood; concurrent writers, WAL bloat,
   and lack of transactions across the KG database make ops fragile.
3. **Backup heterogeneity** — every other VS-stack service (PD, JF, SH, VS itself) backs up via
   `pg_dump`. MemPalace forced us to add tarball backups of `/opt/docker/mempalace/palace/`.
4. **No real dedup** — Chroma dedup is ad-hoc metadata filtering inside ingesters; we want a
   proper UNIQUE constraint.
5. **No hybrid retrieval** — Chroma gives only cosine. We want BM25-ish lexical fallback for
   exact-token recall (names, error messages, IDs).
6. **Operational uniformity** — one database engine, one backup pipeline, one set of metrics.

MP-MONO-03 already provisioned the foundation: pg database `mempalace`, role with password,
`pgvector 0.8.2` extension, and 6 secrets in Infisical project `/mempalace`.

## Decision

Migrate MemPalace storage from ChromaDB + SQLite KG to **PostgreSQL with pgvector**, in-place
on the existing VPS `pg` container.

### Storage layout

Single database `mempalace`, six tables (see `services/mempalace/pg/schema.sql`):

| Table | Purpose | Key columns |
|---|---|---|
| `wings` | top-level namespaces | `name` PK |
| `rooms` | sub-namespaces inside wings | `(wing, name)` PK, FK to wings |
| `drawers` | vector store | `id` PK, `embedding VECTOR(768)`, `content_tsv` generated, `metadata JSONB`, `(wing,room)` FK |
| `kg_entities` | KG nodes (mirrors mempalace.knowledge_graph) | `id` PK, `name`, `type`, `properties JSONB` |
| `kg_triples` | KG edges with bitemporal validity | `subject`/`object` FK to kg_entities, `predicate`, `valid_from`, `valid_to` |

`audit.log` stays as a file for now — see Open Questions.

### Indexes

- `drawers.embedding`: `ivfflat` cosine, `lists=10` (we have ~1.6k rows; will retune in C-08
  using `EXPLAIN ANALYZE` + ef_search probes).
- `drawers.content_tsv`: `GIN` for `to_tsvector('simple', content)` full-text.
- `drawers.(wing, room)`: btree for namespace filtering.
- `drawers.source_id`: **partial UNIQUE** `WHERE source_id IS NOT NULL` — enables
  `INSERT ... ON CONFLICT (source_id) DO NOTHING` in ingesters.
- `drawers.metadata`: GIN `jsonb_path_ops` for occasional JSONB queries.
- `kg_triples.(subject, predicate, object)`: partial UNIQUE `WHERE valid_to IS NULL` — mirrors
  the "open triple" dedup that the SQLite KG enforces in Python.

### Embedding model

Keep **Ollama `nomic-embed-text` 768d**. Reasons:
- Already running on VPS, zero new infra.
- Multilingual (UA/EN/ES) — required for our content mix.
- 768d is small enough for ivfflat to be effectively flat at our scale.
- Changing the model would force a re-ingest of all 1643 drawers — defer until we have
  measurement to justify it.

### Hybrid retrieval (C-04)

Search query path:

1. Embed query with the same Ollama model.
2. Run two retrievers in parallel:
   - **Dense:** `SELECT id, embedding <=> $q::vector AS dist ... ORDER BY dist LIMIT 50`
   - **Lexical:** `SELECT id, ts_rank(content_tsv, plainto_tsquery('simple', $q)) AS rank ... LIMIT 50`
3. **Reciprocal Rank Fusion (RRF)** with `k=60`:
   `score(d) = sum(1 / (k + rank_i(d)))` over both rankings.
4. Apply wing/room filters as `WHERE` clauses (still uses btree index).
5. Return top-N with metadata and content.

This gives us BM25-ish exact-token recall without an external service. RRF is parameter-free
beyond `k`, which is the standard recommendation.

### Dedup

Every ingester computes a stable `source_id` and uses
`INSERT INTO drawers (...) VALUES (...) ON CONFLICT (source_id) DO NOTHING`.
For legacy Chroma rows that lack stable IDs, the migration script (C-05) will synthesize
`source_id = sha256(content)[:16]` so re-runs are idempotent.

### Code path (C-03)

`mempalace/ingest_server.py` and the storage layer move from `chromadb.PersistentClient` to
**SQLAlchemy 2 + psycopg3 (or psycopg2)** with the connection string assembled from Infisical
secrets `/mempalace/DB_*`. We will not introduce ORM models for the KG — the existing dict
shapes from `mempalace.knowledge_graph.KnowledgeGraph` map cleanly to plain SQL.

For the upstream `mempalace` python package (which calls Chroma directly), C-03 will replace
its storage adapter via a thin shim: a class that implements the same `add`/`query`/`get`
methods but writes/reads from `drawers`.

### Migration (C-05)

One-shot script `services/mempalace/pg/migrate_from_chroma.py`:

```
chroma.get(include=["embeddings","metadatas","documents"], limit=batch)
  -> for each row:
      source_id = metadata.get("source_id") or sha256(content)[:16]
      INSERT INTO drawers (id, wing, room, content, embedding, metadata,
                            source, source_id, source_file, chunk_index,
                            filed_at, added_by)
      VALUES (...)
      ON CONFLICT (source_id) DO NOTHING
```

Plus a second pass for KG:

```
sqlite.execute("SELECT * FROM entities") -> INSERT INTO kg_entities ...
sqlite.execute("SELECT * FROM triples")  -> INSERT INTO kg_triples  ...
```

Validation: row counts before/after must match; spot-check 10 random vector queries with the
old Chroma client and the new pg path and compare top-5 IDs.

After successful migration, build the ivfflat index (it benefits from being created
post-bulk-load so the centroids are representative):

```
REINDEX INDEX drawers_embedding_ivfflat;
```

### Rollback

- Keep `/data/palace/chroma.sqlite3` and `knowledge_graph.sqlite3` **read-only** for **30 days**
  after C-07 lands.
- Code rollback: `git revert` of the C-03..C-07 commits restores the Chroma client; secrets and
  schema can stay in place.
- DB rollback: `DROP DATABASE mempalace; CREATE DATABASE mempalace OWNER mempalace;
  CREATE EXTENSION vector;` and re-run `migrate_from_chroma.py`.

## Consequences

**Positive**
- Single backup pipeline (`pg_dump mempalace`).
- Real ACID transactions for ingest + KG writes.
- Hybrid retrieval (dense + lexical) without an extra service.
- UNIQUE-constraint dedup instead of ad-hoc Python checks.
- Same auth/secrets/monitoring story as PD/JF/SH/VS.
- Removes the SEC-01 dual-writer footgun structurally.

**Negative**
- One extra network hop (~1-5 ms) vs. embedded SQLite.
- MemPalace now hard-depends on `pg` container uptime (already true for everything else).
- ivfflat index requires periodic `REINDEX` after large churn (negligible at our scale).

**Risks**
- Embedding model change in the future requires full re-ingest. **Mitigation:** record the
  model name + version in `drawers.metadata->>'embedding_model'` from C-03 onwards.
- pgvector 0.8.x to 0.9.x upgrade may require index rebuild. **Mitigation:** version pinned in
  pg container; we already manage that.

## Alternatives considered

- **Chroma HTTP server mode (MP-ARCH-A)** — cancelled. Required a fragile monkey-patch to make
  the embedded client talk to a server, and didn't fix the SQLite/backup story.
- **Status quo (keep Chroma)** — leaves SEC-01 footgun, doesn't unify backups, no hybrid
  retrieval.
- **Qdrant / Weaviate** — extra container, extra failure mode, no advantage over pgvector at
  our row count. Would only matter past ~1M vectors.
- **OpenAI / Cohere embeddings** — paid, network dependency, ToS concerns for personal data.

## Open questions

1. **`audit_events` table** — should the file `audit.log` move into pg too? Pros: one query
   surface for "what was ingested when". Cons: extra writes on the hot path. **Decision: defer
   to a future ticket.** Keep file for now.
2. **Multi-tenant** — could VS, PD, SH share one MemPalace? Today they all use the same
   database via wings. Not a problem but not formally enforced. **Decision: out of scope for
   this chain.**
3. **ivfflat tuning** — `lists` and `probes` will be measured in C-08 once the migrated corpus
   is in place. Starting value `lists=10` is conservative for 1.6k rows.
4. **Reranker** — should we add a cross-encoder reranker on top of RRF? **Defer until C-08
   eval data shows it's needed.** **Resolved 2026-05-11:** cross-encoder reranker landed and
   restored quality. Post-reranker recall@5 = **83.3%** vs 66.7% pgvector-only baseline and
   82% legacy Chroma+reranker. See `services/mempalace/eval/results-20260511-reranker.md`
   and ADR `docs/adr/mempalace-reranker.md`.

## Migration plan (chain)

| Ticket | Title | Notes |
|---|---|---|
| MP-ARCH-C-01 | Design pgvector schema + ADR | **this ticket** |
| MP-ARCH-C-02 | Provision pg + pgvector + secrets | done as **MP-MONO-03** |
| MP-ARCH-C-03 | Rewrite storage layer (db.py, models.py, search.py, kg.py) | next |
| MP-ARCH-C-04 | Hybrid retrieval (pgvector + tsvector RRF) | depends on C-03 |
| MP-ARCH-C-05 | One-shot migration script Chroma to pg | depends on C-03 |
| MP-ARCH-C-06 | Rewrite ingesters (or wrap ingest_server HTTP) | depends on C-03 |
| MP-ARCH-C-07 | Decommission SQLite files (read-only, then archive) | depends on C-05/C-06 |
| MP-ARCH-C-08 | Post-migration eval + perf baseline + index tuning | depends on C-07 |

## Validation done in C-01

The schema in `services/mempalace/pg/schema.sql` was applied to a throwaway database
`mempalace_schema_test` on the production `pg` container. All `CREATE TABLE`/`CREATE INDEX`
statements succeeded. Sample workload exercised:

- `INSERT` of one row with a 768-dimensional zero-ish vector.
- `SELECT ... ORDER BY embedding <=> $q LIMIT 3` returned `dist=0` for self-match.
- `SELECT ts_rank(content_tsv, plainto_tsquery('simple', '...'))` returned a non-zero rank.
- FK `(wing, room) REFERENCES rooms(wing, name)` was enforced (insert with seeded room
  succeeded).

The only warning was the expected `ivfflat index created with little data` notice, which is
fine: the index will be `REINDEX`-ed after C-05 bulk migration loads ~1.6k rows.

## References

- pgvector docs: <https://github.com/pgvector/pgvector>
- Reciprocal Rank Fusion: Cormack et al. 2009
- ChromaDB metadata sample (live, 2026-04-11): `{added_by, chunk_index, filed_at, room, source_file, wing}`
- KG sqlite schema (live, 2026-04-11): `entities(id,name,type,properties,created_at)`,
  `triples(id,subject,predicate,object,valid_from,valid_to,confidence,source_closet,source_file,extracted_at)`
