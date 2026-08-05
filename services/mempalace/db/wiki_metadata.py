"""Typed metadata envelope for wiki drawers (MP-WIKI-IMPL-04).

Validates the ``metadata`` JSONB payload that ``ingest_agent_wikis.py``
writes onto every wiki drawer. Mirrors the envelope documented in
``docs/adr/mempalace-agent-wikis-integration.md`` §Q3.

TODO(MP-ARCH-FUTURE-05): once Agent A lands ``db/metadata.py`` with the
shared ``DrawerMetadata`` base, rebase this onto it::

    from .metadata import DrawerMetadata

    class WikiDrawerMetadata(DrawerMetadata):
        type: Literal["wiki"] = "wiki"
        ...

For now it ships standalone so MP-WIKI-IMPL-* can land independently.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class WikiDrawerMetadata(BaseModel):
    """Envelope for every drawer under ``wing_agents/room_<agent>``.

    Example::

        {
          "type": "wiki",
          "agent": "architect",
          "wiki_path": "concepts/concept_patterns.md",
          "wiki_section": "concept_patterns",
          "git_sha7": "a1b2c3d",
          "title": "Architectural Patterns (VS)"
        }
    """

    type: Literal["wiki"] = "wiki"
    agent: str = Field(..., min_length=1, max_length=64,
                       description="Owning agent — maps to room_<agent>")
    wiki_path: str = Field(..., min_length=1, max_length=256,
                           description="Path relative to <agent>/wiki/ (e.g. concepts/concept_patterns.md)")
    wiki_section: str = Field(..., min_length=1, max_length=128,
                              description="Filename stem (e.g. concept_patterns)")
    git_sha7: str = Field(..., min_length=4, max_length=16,
                          description="Short sha of the last commit that modified this file")
    title: str | None = Field(default=None, max_length=512,
                              description="First H1 from the markdown, for display")

    model_config = {
        # wiki ingester attaches a few transport-only fields (chunk_index,
        # total_chunks); accept them without validation errors.
        "extra": "allow",
    }
