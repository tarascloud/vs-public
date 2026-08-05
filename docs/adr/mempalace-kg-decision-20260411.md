# MemPalace KG: Drop empty tables, revive via wikis when seed corpus exists

**ADR:** MP-ARCH-FUTURE-03
**Date:** 2026-04-11
**Status:** Accepted — implemented in commit `refactor(mempalace): remove kg_entities/kg_triples (FUTURE-03 drop)`
**Decision driver:** Owner (architect review)

## Context

MemPalace ships two first-class storage layers:

1. **Drawers** (`drawers` table) — pgvector + tsvector hybrid retrieval. 1625 rows across 14 wing/room combinations. Ingested daily from claude sessions, VS DB, PD chat, shuleansky transcripts. This is the "working memory" of the palace.
2. **Knowledge Graph** (`kg_entities` + `kg_triples`) — typed subject→predicate→object triples with temporal validity (`valid_from`/`valid_to`). Inherited verbatim from the upstream mempalace sqlite schema during MP-ARCH-C-01.

Current state of the KG:

| Table | Rows | Indexes | Ingest path | Consumer |
|-------|------|---------|-------------|----------|
| `kg_entities` | **0** | 3 (pk, name, type) | none | `mempalace_kg_query`, `mempalace_kg_stats` |
| `kg_triples` | **0** | 5 (pk, subj, obj, pred, valid, open-unique) | none | same |

The tables have existed for ~4 weeks. Zero writes. Zero reads. No extractor ever shipped. Upstream mempalace used a manual `kg_add` tool driven by the human operator — Owner never typed a single triple.

Two reviews have flagged this already:
- **MP-ARCH-FUTURE-REVIEW** (architect v2, 2026-04-11): called kg_entities/kg_triples **"dead weight"** — cost of keeping (schema drift risk, confusing MCP surface) exceeds option value.
- **MP-WIKI-RESEARCH-01** (2026-04-11): identified agent wikis as the **ideal seed corpus** for a future KG. Wikis are structured Markdown with clear entities (agent, command, room), making them trivial to mine compared to raw claude transcripts.

## Options

### A. Build now

Write an LLM-backed extractor that mines drawers (or wikis) into triples. Ship an MP-KG-IMPL-* initiative with its own evaluator.

**Cost:** 3–5 days engineering. New eval harness. New moving part in the MCP surface. Another thing to monitor and re-embed when models change.

**Benefit:** Multi-session reasoning — "who was Owner's therapist in 2024?" becomes a typed lookup instead of a fuzzy drawer search.

**Risk:** The same reasoning works today via `mempalace_search` against drawers. Nobody has hit a query where hybrid retrieval fails and a typed graph would win. We would be building infrastructure for a hypothetical user story.

### B. Drop now, revive via wikis later

`DROP` both tables. Remove `db/kg.py`, delete the five `mempalace_kg_*` MCP tools, strip KG code from `local_mcp_server.py` and `migrate_from_chroma.py`, remove model classes. Document the revival path: when the MP-WIKI stack lands, a wiki → triple extractor can populate a new (schema-identical or better) KG.

**Cost:** 1 day engineering. ~200 net lines deleted. One migration. Mac MCP clients lose 5 tool names (none currently used).

**Benefit:** Smaller palace surface (34 MCP tools → 29). One less integration test surface. One less place for silent schema drift. The ingest/search/diary/drawers subsystems are what actually ship value — let them breathe without dead neighbours.

## Decision

**B. Drop.** Rationale, in priority order:

1. **YAGNI.** Four weeks, zero writes, zero reads, zero user demand. Every hour spent thinking about KG semantics is an hour not spent improving drawer recall. The forward-looking review already called this out — deferring the decision again would be a review-debt smell.
2. **Revival is cheap.** The schema is 40 lines of DDL. The CRUD layer is 137 lines. If a real use case emerges (wiki extractor, agent self-modeling, fact invalidation UX), we re-apply `schema.sql` in 10 minutes. Nothing is lost by dropping empty tables.
3. **Seed path already identified.** MP-WIKI-RESEARCH-01 explicitly flagged wikis as the ideal KG seed corpus. Dropping now forces revival to be wiki-driven — which is better than hand-crafted triples because wikis are structured, reviewed, and versioned.
4. **MCP clarity.** The `mempalace_kg_*` tools currently return empty results silently. A reader of the tool list assumes the KG exists and is just sparse. Removing the tools makes the palace's actual capabilities legible.
5. **Prior review consensus.** Two independent reviews landed on the same call. Architect v2 said "dead weight"; this review agrees. No new signal to re-litigate.

## Implementation

Applied as part of FUTURE-03 in the same release branch:

1. **Migration** `services/mempalace/pg/migrations/20260411_drop_kg.sql`:
   - `DROP TABLE kg_triples` (FK cascades)
   - `DROP TABLE kg_entities`
2. **Schema** — removed KG section from `services/mempalace/pg/schema.sql` (still the canonical DDL for fresh installs).
3. **ORM** — removed `KgEntity` + `KgTriple` classes from `services/mempalace/db/models.py`.
4. **CRUD** — deleted `services/mempalace/db/kg.py` (137 lines).
5. **MCP server** — removed five tool handlers (`tool_kg_query`, `tool_kg_add`, `tool_kg_invalidate`, `tool_kg_timeline`, `tool_kg_stats`) and their TOOLS[] entries from `services/mempalace/local_mcp_server.py`. Updated `PALACE_PROTOCOL` string: steps 2 and 5 now reference `mempalace_search` only.
6. **Tests** — removed `test_kg_entity_triple` from `services/mempalace/db/test_smoke.py`.
7. **Legacy migration** — `services/mempalace/pg/migrate_from_chroma.py` had `migrate_kg()` which is dead code (chroma→pg migration already completed in MP-ARCH-C-07). Changed to a no-op stub that logs "KG migration disabled — see FUTURE-03 ADR".
8. **Production DB** — drop applied live on `mempalace` database on VPS pg container, final step of this task.

## Revival path (when wiki extractor ships)

If/when an MP-WIKI-KG-EXTRACT-01 initiative is approved:

1. Re-apply the KG section from git history (pre-FUTURE-03 `schema.sql`) into a new migration `pg/migrations/YYYYMMDD_readd_kg.sql`.
2. Consider a redesigned schema: drop `valid_from`/`valid_to` until a real temporal use case exists (YAGNI recursively); use `source_drawer_id` as FK to `drawers(id)` so triples trace back to the wiki/drawer that minted them.
3. Extractor lives in `services/mempalace/kg_extract/` — dedicated container, not coupled to ingest (KG refresh is orthogonal to drawer refresh).
4. MCP tools come back with the same names (`mempalace_kg_query`, etc.) so prompt contracts don't change for clients that pre-dated the drop.

## Consequences

- **Mac MCP clients** lose 5 tool names. None of them were listed as "used" in any agent prompt or session log. Zero blast radius.
- `PALACE_PROTOCOL` (the verbatim upstream string shipped with every wake-up) now mentions only `mempalace_search`. This is a visible deviation from upstream — fine, we are a fork.
- `migrate_from_chroma.py` is on the path to archival. MP-ARCH-C-07 marked it "one-shot historical" already; stripping KG brings it closer to pure doc status.
- Restore drill (FUTURE-04, same release) no longer asserts on `kg_entities` / `kg_triples` counts. It asserts on drawer count + content_tsv queries only.

## Related

- MP-ARCH-C-01 — original schema with KG
- MP-ARCH-C-07 — chroma → pg cutover
- MP-ARCH-C-09 — local_mcp_server.py fork
- MP-ARCH-FUTURE-REVIEW — flagged KG as dead weight
- MP-WIKI-RESEARCH-01 — identified wikis as KG seed corpus
- MP-ARCH-FUTURE-04 — restore drill eval queries (companion)
- MP-ARCH-FUTURE-07 — embedding upgrade path (companion)
