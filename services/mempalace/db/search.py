"""Retrieval over mempalace drawers — dense, lexical, and RRF hybrid.

Implements the C-04 ADR's RRF k=60 recipe over pgvector + tsvector. Dense
search uses cosine distance (`<=>`), lexical uses `ts_rank(content_tsv,
plainto_tsquery('simple', :q))`. Returns ORM Drawer rows paired with a score.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .embedder import OllamaEmbedder
from .models import Drawer

if False:  # TYPE_CHECKING
    from .reranker import CrossEncoderReranker  # noqa: F401


# ── Helpers ──────────────────────────────────────────────────────────────

def _apply_filters(
    stmt,
    wing: Optional[str],
    room: Optional[str],
    filed_at_from: Optional[datetime] = None,
    filed_at_to: Optional[datetime] = None,
):
    if wing is not None:
        stmt = stmt.where(Drawer.wing == wing)
    if room is not None:
        stmt = stmt.where(Drawer.room == room)
    if filed_at_from is not None:
        stmt = stmt.where(Drawer.filed_at >= filed_at_from)
    if filed_at_to is not None:
        stmt = stmt.where(Drawer.filed_at <= filed_at_to)
    return stmt


# ── Dense (vector) search ────────────────────────────────────────────────

def dense_search(
    session: Session,
    query_vec: list[float],
    limit: int = 50,
    wing: Optional[str] = None,
    room: Optional[str] = None,
    filed_at_from: Optional[datetime] = None,
    filed_at_to: Optional[datetime] = None,
) -> list[tuple[Drawer, float]]:
    """Return top-N drawers by cosine distance to query_vec.

    Uses pgvector's `<=>` (cosine distance, smaller = closer).
    Returns list of (Drawer, distance) sorted ascending by distance.
    """
    # pgvector operator <=> via SQLAlchemy: Drawer.embedding.cosine_distance(query_vec)
    dist = Drawer.embedding.cosine_distance(query_vec).label("distance")
    stmt = select(Drawer, dist)
    stmt = _apply_filters(stmt, wing, room, filed_at_from, filed_at_to)
    stmt = stmt.order_by(dist).limit(limit)

    rows = session.execute(stmt).all()
    return [(row[0], float(row[1])) for row in rows]


# ── Lexical (full-text) search ───────────────────────────────────────────

def lexical_search(
    session: Session,
    query_text: str,
    limit: int = 50,
    wing: Optional[str] = None,
    room: Optional[str] = None,
    filed_at_from: Optional[datetime] = None,
    filed_at_to: Optional[datetime] = None,
) -> list[tuple[Drawer, float]]:
    """Return top-N drawers by ts_rank on content_tsv.

    Uses `plainto_tsquery('simple', :q)` so users don't need to build
    tsquery syntax. Rows with zero rank are excluded.
    """
    # MP-C-08-TSVCONFIG: hybrid english+simple tsquery for mixed Ukrainian/English corpus.
    # english gives stemming for ASCII tokens (users→user); simple preserves Cyrillic tokens.
    tsquery_en = func.plainto_tsquery("english", query_text)
    tsquery_si = func.plainto_tsquery("simple", query_text)
    tsquery = (tsquery_en.op("||")(tsquery_si))
    rank = func.ts_rank(Drawer.content_tsv, tsquery).label("rank")

    stmt = select(Drawer, rank).where(Drawer.content_tsv.op("@@")(tsquery))
    stmt = _apply_filters(stmt, wing, room, filed_at_from, filed_at_to)
    stmt = stmt.order_by(rank.desc()).limit(limit)

    rows = session.execute(stmt).all()
    return [(row[0], float(row[1])) for row in rows]


# ── Hybrid RRF fusion ────────────────────────────────────────────────────

def hybrid_search(
    session: Session,
    query_text: str,
    limit: int = 10,
    wing: Optional[str] = None,
    room: Optional[str] = None,
    k: int = 60,
    candidates: int = 50,
    embedder: Optional[OllamaEmbedder] = None,
    reranker: Optional["CrossEncoderReranker"] = None,
    rerank_pool: int = 20,
    filed_at_from: Optional[datetime] = None,
    filed_at_to: Optional[datetime] = None,
    acronym_boost: float = 0.15,
) -> list[tuple[Drawer, float]]:
    """Hybrid dense + lexical retrieval fused by Reciprocal Rank Fusion.

    RRF score for a document d =
        sum over retrievers r of 1 / (k + rank_r(d))

    Returns list of (Drawer, rrf_score) sorted by score descending.
    If `embedder` is None a default OllamaEmbedder() is instantiated.
    """
    emb = embedder or OllamaEmbedder()
    query_vec = emb.embed_one(query_text)

    dense = dense_search(session, query_vec, limit=candidates, wing=wing, room=room, filed_at_from=filed_at_from, filed_at_to=filed_at_to)
    lex = lexical_search(session, query_text, limit=candidates, wing=wing, room=room, filed_at_from=filed_at_from, filed_at_to=filed_at_to)

    # Accumulate RRF scores keyed by drawer id.
    scores: dict[str, float] = {}
    drawers: dict[str, Drawer] = {}

    for rank, (drawer, _d) in enumerate(dense, start=1):
        scores[drawer.id] = scores.get(drawer.id, 0.0) + 1.0 / (k + rank)
        drawers[drawer.id] = drawer

    for rank, (drawer, _r) in enumerate(lex, start=1):
        scores[drawer.id] = scores.get(drawer.id, 0.0) + 1.0 / (k + rank)
        drawers.setdefault(drawer.id, drawer)

    # MP-ARCH-FUTURE-10: acronym/identifier boost — tokens matching [A-Z][A-Z0-9_-]{2,11} get small score bonus per hit
    import re as _re
    _acronym_re = _re.compile(r"\b[A-Z][A-Z0-9_-]{2,11}\b")
    _acronyms = set(_acronym_re.findall(query_text))
    if _acronyms and acronym_boost > 0:
        for did, drawer in drawers.items():
            _content = drawer.content or ""
            _hits = sum(1 for a in _acronyms if a in _content)
            if _hits > 0:
                scores[did] = scores.get(did, 0.0) + acronym_boost * _hits / max(1, len(_acronyms))

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)

    # MP-C-08-RERANKER: rerank a wider top-N pool FIRST so the cross-encoder
    # can surface relevant items that RRF ranked past the final limit, and
    # diversification can then draw from a re-ordered set. Order of ops:
    #   1. Take top `rerank_pool` RRF results (e.g. 30)
    #   2. CrossEncoder rerank them  (semantic relevance)
    #   3. Diversify (max 2 per source) to final `limit`
    # When reranker is disabled this degrades to the previous behaviour
    # (MP-C-08-DIVERSIFY: diversify RRF-ordered results directly).
    pool_ids = [did for did, _ in ranked[:rerank_pool]]
    pool = [(drawers[did], scores[did]) for did in pool_ids]

    if reranker is not None and len(pool) > 1:
        pool = reranker.rerank(query_text, pool)
        # Fall-through to diversification using reranker order.

    # MP-C-08-DIVERSIFY: enforce max 2 results per source_file in top-limit.
    # Prevents a single large claude-code session from dominating all slots.
    max_per_source = 2
    per_source: dict[str, int] = {}
    selected: list[tuple[Drawer, float]] = []
    for drawer, score in pool:
        key = drawer.source_file or drawer.source or "unknown"
        if per_source.get(key, 0) >= max_per_source:
            continue
        per_source[key] = per_source.get(key, 0) + 1
        selected.append((drawer, score))
        if len(selected) >= limit:
            break

    # If we didn't fill limit from pool (small corpus / rare query), top up
    # from the rest of the RRF-ranked tail without the per-source cap to
    # avoid returning fewer than `limit` when `rerank_pool` was too narrow.
    if len(selected) < limit:
        already = {id(d) for d, _ in selected}
        for did, score in ranked[rerank_pool:]:
            drawer = drawers[did]
            if id(drawer) in already:
                continue
            selected.append((drawer, score))
            if len(selected) >= limit:
                break

    return selected
