"""Storage layer for the MemPalace ingestion sidecar — embedding, chunking,
drawer insertion and metadata validation.

Extracted from ingest_server.py (god-file split, cmq8l618n005x01lrtjy30xcs).
Behaviour preserved verbatim.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert

from db import writer_session_scope
from db.embedder import OllamaEmbedder
from db.models import Drawer

# ── Embedding (Ollama nomic-embed-text, 768d multilingual) ───────────────────
OLLAMA_EMBED_URL_BASE = os.environ.get("OLLAMA_EMBED_URL", "http://ollama:11434")
OLLAMA_EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")

_embedder: Optional[OllamaEmbedder] = None


def get_embedder() -> OllamaEmbedder:
    """Return lazily-initialised OllamaEmbedder instance."""
    global _embedder
    if _embedder is None:
        _embedder = OllamaEmbedder(base_url=OLLAMA_EMBED_URL_BASE, model=OLLAMA_EMBED_MODEL)
        print(
            f"[mempalace-ingest] Embedder: {OLLAMA_EMBED_MODEL} @ {OLLAMA_EMBED_URL_BASE}"
            f" (dim={_embedder.dim})",
            flush=True,
        )
    return _embedder


# ── Content chunking ─────────────────────────────────────────────────────────
# Ollama nomic-embed-text context limit is ~3800 chars.
INGEST_CHUNK_SIZE = int(os.environ.get("INGEST_CHUNK_SIZE", "800"))
INGEST_CHUNK_OVERLAP = int(os.environ.get("INGEST_CHUNK_OVERLAP", "100"))
INGEST_MIN_CHUNK = int(os.environ.get("INGEST_MIN_CHUNK", "50"))

_chunk_counter = 0


def next_chunk_index() -> int:
    global _chunk_counter
    _chunk_counter += 1
    return _chunk_counter


def _chunk_content(content: str) -> list[str]:
    """Split content into chunks suitable for embedding.

    Paragraph-aware with overlap. Kept well within Ollama nomic-embed-text's
    ~3800 char context.
    """
    content = content.strip()
    if not content:
        return []
    if len(content) <= INGEST_CHUNK_SIZE:
        return [content]

    chunks: list[str] = []
    start = 0
    while start < len(content):
        end = min(start + INGEST_CHUNK_SIZE, len(content))
        if end < len(content):
            pp = content.rfind("\n\n", start, end)
            if pp > start + INGEST_CHUNK_SIZE // 2:
                end = pp
            else:
                nl = content.rfind("\n", start, end)
                if nl > start + INGEST_CHUNK_SIZE // 2:
                    end = nl
        chunk = content[start:end].strip()
        if len(chunk) >= INGEST_MIN_CHUNK:
            chunks.append(chunk)
        start = end - INGEST_CHUNK_OVERLAP if end < len(content) else end

    return chunks if chunks else [content[:INGEST_CHUNK_SIZE]]


def add_chunked(
    *,
    wing: str,
    room: str,
    content: str,
    source: str,
    source_id: Optional[str],
    base_chunk_index: int,
    agent: str,
    extra_metadata: Optional[dict[str, Any]] = None,
) -> int:
    """Add content to palace, chunking and dedup-via-source_id. Returns stored count.

    Each chunk's effective source_id is `source_id:chunk-<i>` if source_id is
    provided, else None (no dedup). Embedding and insert happen in one session.
    """
    chunks = _chunk_content(content)
    if not chunks:
        return 0

    embedder = get_embedder()
    vectors = embedder.embed(chunks)

    stored = 0
    with writer_session_scope() as s:
        for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
            # MP-WIKI-IMPL-01 / MP-ARCH-FUTURE-06: make the effective source_id
            # deterministic across runs so ON CONFLICT (source_id) DO NOTHING
            # actually dedups on --rebuild. Previously we used a
            # per-process monotonic counter (base_chunk_index + i), which
            # made every rerun insert new rows because K kept growing.
            effective_source_id = (
                f"{source_id}:chunk-{i}" if source_id else None
            )
            meta: dict[str, Any] = {
                "embedding_model": OLLAMA_EMBED_MODEL,
            }
            if extra_metadata:
                meta.update(extra_metadata)

            values = {
                "id": str(uuid.uuid4()),
                "wing": wing,
                "room": room,
                "content": chunk,
                "embedding": vec,
                "metadata": _validate_metadata(meta),
                "source": source,
                "source_id": effective_source_id,
                "source_file": source,
                "chunk_index": base_chunk_index + i,
                "added_by": agent,
                "scrubbed_at": datetime.now(timezone.utc),  # MP-ARCH-FUTURE-01
            }

            if effective_source_id is not None:
                stmt = (
                    pg_insert(Drawer.__table__)
                    .values(**values)
                    .on_conflict_do_nothing(
                        index_elements=["source_id"],
                        index_where=Drawer.__table__.c.source_id.isnot(None),
                    )
                    .returning(Drawer.__table__.c.id)
                )
                result = s.execute(stmt)
                # RETURNING returns a row only on actual insert (not on conflict skip).
                if result.first() is not None:
                    stored += 1
            else:
                s.execute(pg_insert(Drawer.__table__).values(**values))
                stored += 1

    return stored


# -- Metadata validation (MP-ARCH-FUTURE-05) ---------------------------------

_meta_logger = logging.getLogger("mempalace.metadata")


def _validate_metadata(meta: dict) -> dict:
    """Validate metadata dict against DrawerMetadata Pydantic schema.

    Compat mode: missing required fields (source_type, embedding_model) produce
    a WARNING rather than raising, so existing ingesters are not broken during
    rollout. Extra unknown keys are also logged as warnings (extra="allow").

    Returns the original dict unchanged -- validation is advisory for now.
    """
    try:
        from db.metadata import DrawerMetadata
        DrawerMetadata.model_validate(meta)
        # Log extra keys not in the declared schema
        schema_fields = set(DrawerMetadata.model_fields.keys())
        extra_keys = set(meta.keys()) - schema_fields
        if extra_keys:
            _meta_logger.warning(
                "metadata contains unexpected keys (consider adding to DrawerMetadata): %s",
                sorted(extra_keys),
            )
    except Exception as exc:
        _meta_logger.warning("metadata validation warning: %s | meta=%r", exc, meta)
    return meta
