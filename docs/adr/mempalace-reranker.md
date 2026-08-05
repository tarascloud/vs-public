# ADR: MemPalace Cross-Encoder Reranker (MP-C-08-RERANKER)

**Status:** IMPLEMENTED (2026-05-11)
**Date:** 2026-04-19 (planned), 2026-05-11 (resolved)
**Ticket:** REV-20260419-0051
**Related:** `mempalace-pgvector.md`, `mempalace-embedding-upgrade-path.md`
**Result:** recall@5 = **83.3%** (target >= 82% met). See
`services/mempalace/eval/results-20260511-reranker.md`.

## Context

Post-pgvector migration (2026-04-11) eval: **recall@5 = 66.7%** (15 queries).
Legacy Chroma + BGE reranker baseline: **82%**. Gap = **15.3pp**, root cause
is pgvector retrieval returns top-20 with weaker lexical-vs-dense balance
than Chroma+reranker pipeline. Target: restore >= 82% recall@5.
**Outcome (2026-05-11):** reranker implementation restored recall@5 to
**83.3%**, surpassing the legacy 82% baseline.

## Decision

Add optional cross-encoder reranking on top of pgvector RRF retrieval:

1. Retrieve top-20 candidates via existing hybrid (dense + lexical + RRF
   fusion, k=60) pipeline in `POST /search`.
2. If `rerank=true` param (default `false`), score every (query, candidate)
   pair through `BAAI/bge-reranker-v2-m3` cross-encoder, sort by score
   descending, return top-k (default 5).
3. Keep `rerank=false` path unchanged — zero regression for existing callers.

## Implementation Plan

### Phase 1 — model serving (prerequisite)
- Option A: `ollama pull bge-reranker-v2-m3` (if supported by Ollama —
  **verify first**; BGE rerankers typically need cross-encoder inference,
  not generative inference).
- Option B: sentence-transformers `CrossEncoder(BAAI/bge-reranker-v2-m3)`
  inside `mempalace` container. Add `sentence-transformers>=3.0` to
  `requirements.txt`. Download model to mounted volume
  `/data/models/bge-reranker-v2-m3/` at container start.
- **Chosen:** Option B (pinned, deterministic, no extra network dep on
  Ollama cycles). Adds ~500MB image size.

### Phase 2 — endpoint change
`services/mempalace/ingest_server.py::search()` (or
`mempalace/mcp_server.py` for MCP-side):

```python
if payload.get("rerank"):
    from .reranker import rerank_candidates  # lazy import
    candidates = hybrid_search(query, k=20)  # fetch wider
    scored = rerank_candidates(query, candidates)  # cross-encoder
    return scored[:k]
else:
    return hybrid_search(query, k=k)  # unchanged
```

New module `services/mempalace/mempalace/reranker.py` owns the
CrossEncoder singleton + scoring loop.

### Phase 3 — eval
`services/mempalace/eval/eval_reranker.py` — copy `run_eval.py`, pass
`rerank=true`, compare recall@5 to baseline. Publish results in
`eval/results-YYYYMMDD-reranker.md`.

## Alternatives Considered

- **Bigger dense embedding (mxbai-embed-large):** already evaluated in
  `mempalace-embedding-upgrade-path.md` — marginal gain, still below 82%.
- **Expand RRF k=60 → k=200:** diminishing returns, latency grows.
- **Chroma rollback:** vetoed — pgvector unifies storage with pg,
  simplifies backup/restore, audit already complete.

## Rollback

`rerank=false` (default) uses unchanged pgvector RRF pipeline. No data
migration. Simply ship Phase 1+2 behind `rerank` flag; if eval regresses,
do not flip callers.

## Open Questions

1. Cold-start latency: CrossEncoder load adds ~2-3s at first request. Warm
   on container start in background thread.
2. Memory: model ~600MB RAM. `mempalace` container mem_limit already 2g;
   headroom OK.
3. GPU vs CPU: inference is ~60ms/pair on CPU x 20 candidates = ~1.2s total.
   Acceptable for interactive search. If not — consider ONNX quantized
   variant.

## Acceptance (when implemented)

- [ ] `pip show sentence-transformers` in mempalace container returns >=3.0
- [ ] `POST /search {"rerank": true, ...}` returns results with a
      `rerank_score` field
- [ ] `eval_reranker.py` recall@5 >= 80% on existing queries.yaml (stretch
      target 82%)
- [ ] Legacy `rerank=false` calls unchanged (regression test)
