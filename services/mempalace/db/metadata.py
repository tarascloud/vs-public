"""DrawerMetadata — Pydantic envelope for drawers.metadata JSONB column.

MP-ARCH-FUTURE-05: establishes a typed contract for the metadata field so
ingesters cannot silently diverge on field names.

Design decisions:
- extra = "allow": existing rows and ingesters in transition are not broken.
- All fields optional except source_type and embedding_model (core audit fields).
- Subclasses may add domain-specific required fields (see wiki_metadata.py).

# Extended by services/mempalace/db/wiki_metadata.py via MP-WIKI-IMPL-04
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict


# Union of source_type values used by all ingesters today.
SourceType = Literal[
    "claude_session",
    "pd_chat",
    "vs_task",
    "vs_webhook",
    "decision",
    "transcript",
    "convo",
    "wiki",
    "nightly",
    "unknown",
]


class DrawerMetadata(BaseModel):
    """Typed metadata envelope for drawers.metadata JSONB.

    Required fields (must be present for new inserts):
      source_type    — origin category of the content
      embedding_model — model used to produce the embedding vector

    Optional fields — union of all fields used by current ingesters.
    Extra keys from legacy rows are preserved via extra="allow".
    """

    model_config = ConfigDict(extra="allow")

    # ── Required core fields ──────────────────────────────────────────────────
    source_type: SourceType
    embedding_model: str

    # ── Versioning ────────────────────────────────────────────────────────────
    ingester_version: Optional[str] = None

    # ── Source provenance ─────────────────────────────────────────────────────
    raw_source_uri: Optional[str] = None
    git_sha: Optional[str] = None

    # ── Session / chat IDs ────────────────────────────────────────────────────
    session_id: Optional[str] = None
    pd_chat_id: Optional[str] = None

    # ── Agent context ─────────────────────────────────────────────────────────
    agent_name: Optional[str] = None

    # ── Conversation / transcript fields ─────────────────────────────────────
    hall: Optional[str] = None
    participants: Optional[list[str]] = None
    speakers: Optional[list[str]] = None

    # ── Decision fields ───────────────────────────────────────────────────────
    type: Optional[str] = None
    title: Optional[str] = None

    # ── VS task / webhook fields ───────────────────────────────────────────────
    ticketId: Optional[str] = None
    status: Optional[str] = None
    initiativeId: Optional[str] = None
    commitHash: Optional[str] = None
    verificationStatus: Optional[str] = None
    routed_room: Optional[str] = None
    via: Optional[str] = None

    # ── Legacy / migration fields (present in existing rows) ──────────────────
    legacy_chroma_id: Optional[str] = None
    migrated_at: Optional[str] = None
    migrated_from: Optional[str] = None

    # ── Wiki section (added by MP-WIKI-IMPL-04 subclass) ─────────────────────
    wiki_section: Optional[str] = None
