"""MemPalace storage layer — SQLAlchemy 2.0 + pgvector (MP-ARCH-C-03).

Replaces direct chromadb usage for ingestion/search. Upstream mempalace 3.x
package still speaks Chroma for its own mcp_server reads; a shim for that
will be introduced in a later ticket (see MP-ARCH-C-06).

Public surface:

    from services.mempalace.db import engine, get_session, models, embedder,
        search, kg

Environment:
    MEMPALACE_DB_URL       full SQLAlchemy URL (overrides individual vars)
    MEMPALACE_DB_HOST      default: pg
    MEMPALACE_DB_PORT      default: 5432
    MEMPALACE_DB_NAME      default: mempalace
    MEMPALACE_DB_USER      default: mempalace
    MEMPALACE_DB_PASSWORD  default: mempalace
"""
from __future__ import annotations

from .engine import get_engine, get_session, session_scope, get_writer_engine, get_writer_session, writer_session_scope
from . import models, embedder, search

__all__ = [
    "get_engine",
    "get_session",
    "session_scope",
    "get_writer_engine",
    "get_writer_session",
    "writer_session_scope",
    "models",
    "embedder",
    "search",
]
