"""Integration smoke test for db/ layer. Skipped if MEMPALACE_DB_URL unset.

Run with:
    MEMPALACE_DB_URL=postgresql+psycopg://mempalace:...@pg:5432/mempalace \
        pytest services/mempalace/db/test_smoke.py -v
"""
from __future__ import annotations

import os
import uuid

import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("MEMPALACE_DB_URL"),
    reason="MEMPALACE_DB_URL not set; integration smoke skipped",
)


def test_drawer_roundtrip() -> None:
    from services.mempalace.db import session_scope
    from services.mempalace.db.embedder import OllamaEmbedder
    from services.mempalace.db.models import Drawer
    from services.mempalace.db.search import hybrid_search

    emb = OllamaEmbedder()
    vec = emb.embed_one("smoke test content about architecture")

    marker = f"smoketest-{uuid.uuid4().hex[:8]}"
    with session_scope() as s:
        d = Drawer(
            wing="wing_vs",
            room="room_decisions",
            content=f"hybrid search smoke test {marker}",
            embedding=vec,
            meta_={"embedding_model": "nomic-embed-text"},
            source="manual",
            source_id=marker,
            added_by="pytest-smoke",
        )
        s.add(d)
        s.flush()
        did = d.id

    with session_scope() as s:
        fetched = s.get(Drawer, did)
        assert fetched is not None
        assert fetched.content.startswith("hybrid search smoke test")

        results = hybrid_search(
            s,
            f"hybrid search smoke test {marker}",
            limit=5,
            wing="wing_vs",
            room="room_decisions",
            embedder=emb,
        )
        assert any(r[0].id == did for r in results)

        # Cleanup
        s.delete(fetched)


# test_kg_entity_triple removed in MP-ARCH-FUTURE-03 (2026-04-11) — KG dropped.
