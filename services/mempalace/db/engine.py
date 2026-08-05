"""SQLAlchemy 2.0 engine + session factory for mempalace pg store.

The engine is lazily initialised on first access so that module imports do
not fail when the db is unreachable (health endpoint must still return 200).

Two engines are provided:
  - get_engine() / session_scope()        → reader (mempalace role, SELECT only)
  - get_writer_engine() / writer_session_scope() → writer (mempalace_writer role, full CRUD)

Principle of least privilege: search/stats endpoints use reader; ingest/write
endpoints use writer. If mempalace role is compromised, attacker cannot write.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


_engine: Optional[Engine] = None
_SessionFactory: Optional[sessionmaker[Session]] = None

_engine_writer: Optional[Engine] = None
_SessionWriterFactory: Optional[sessionmaker[Session]] = None


def _force_psycopg(url: str) -> str:
    """Normalise any postgresql:// or postgres:// URL to use psycopg3 driver."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def _build_url() -> str:
    url = os.environ.get("MEMPALACE_DB_URL")
    if url:
        return _force_psycopg(url)
    host = os.environ.get("MEMPALACE_DB_HOST", "pg")
    port = os.environ.get("MEMPALACE_DB_PORT", "5432")
    name = os.environ.get("MEMPALACE_DB_NAME", "mempalace")
    user = os.environ.get("MEMPALACE_DB_USER", "mempalace")
    pwd = os.environ.get("MEMPALACE_DB_PASSWORD", "mempalace")
    return f"postgresql+psycopg://{user}:{pwd}@{host}:{port}/{name}"


def _build_writer_url() -> str:
    """Build DSN for the writer role (mempalace_writer).

    Prefers MEMPALACE_WRITER_DB_URL; falls back to individual MEMPALACE_WRITER_DB_*
    vars. If neither is set, falls back to the reader URL so the server still
    starts in minimal environments (development/testing).
    """
    url = os.environ.get("MEMPALACE_WRITER_DB_URL")
    if url:
        return _force_psycopg(url)
    host = os.environ.get("MEMPALACE_WRITER_DB_HOST") or os.environ.get("MEMPALACE_DB_HOST", "pg")
    port = os.environ.get("MEMPALACE_WRITER_DB_PORT") or os.environ.get("MEMPALACE_DB_PORT", "5432")
    name = os.environ.get("MEMPALACE_WRITER_DB_NAME") or os.environ.get("MEMPALACE_DB_NAME", "mempalace")
    user = os.environ.get("MEMPALACE_WRITER_DB_USER", "")
    pwd = os.environ.get("MEMPALACE_WRITER_DB_PASSWORD", "")
    if user and pwd:
        return f"postgresql+psycopg://{user}:{pwd}@{host}:{port}/{name}"
    # Fallback: no dedicated writer creds — use reader URL (dev/test only)
    import warnings
    warnings.warn(
        "MEMPALACE_WRITER_DB_URL / MEMPALACE_WRITER_DB_USER not set; "
        "writer engine falls back to reader credentials. "
        "Set these in production.",
        RuntimeWarning,
        stacklevel=3,
    )
    return _build_url()


def get_engine() -> Engine:
    """Return lazily-initialised process-wide SQLAlchemy engine (reader role)."""
    global _engine, _SessionFactory
    if _engine is None:
        url = _build_url()
        _engine = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=int(os.environ.get("MEMPALACE_DB_POOL_SIZE", "5")),
            max_overflow=int(os.environ.get("MEMPALACE_DB_MAX_OVERFLOW", "5")),
            future=True,
        )
        _SessionFactory = sessionmaker(
            bind=_engine,
            expire_on_commit=False,
            class_=Session,
            future=True,
        )
    return _engine


def get_writer_engine() -> Engine:
    """Return lazily-initialised process-wide SQLAlchemy engine (writer role)."""
    global _engine_writer, _SessionWriterFactory
    if _engine_writer is None:
        url = _build_writer_url()
        _engine_writer = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=int(os.environ.get("MEMPALACE_DB_WRITER_POOL_SIZE", "5")),
            max_overflow=int(os.environ.get("MEMPALACE_DB_WRITER_MAX_OVERFLOW", "5")),
            future=True,
        )
        _SessionWriterFactory = sessionmaker(
            bind=_engine_writer,
            expire_on_commit=False,
            class_=Session,
            future=True,
        )
    return _engine_writer


def get_session() -> Session:
    """Return a new Session bound to the reader engine. Caller must close."""
    if _SessionFactory is None:
        get_engine()
    assert _SessionFactory is not None
    return _SessionFactory()


def get_writer_session() -> Session:
    """Return a new Session bound to the writer engine. Caller must close."""
    if _SessionWriterFactory is None:
        get_writer_engine()
    assert _SessionWriterFactory is not None
    return _SessionWriterFactory()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional context manager for READ operations (mempalace role).

    Commits on successful exit, rolls back on exception. Always closes.
    """
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def writer_session_scope() -> Iterator[Session]:
    """Transactional context manager for WRITE operations (mempalace_writer role).

    Commits on successful exit, rolls back on exception. Always closes.
    Use this for all INSERT/UPDATE/DELETE paths (ingest, KG add/invalidate,
    diary write, drawer delete) to enforce least-privilege separation.
    """
    session = get_writer_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
