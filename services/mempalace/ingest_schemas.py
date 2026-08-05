"""Pydantic request/response schemas for the MemPalace ingestion sidecar.

Extracted from ingest_server.py (god-file split, cmq8l618n005x01lrtjy30xcs).
Behaviour preserved verbatim.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class IngestConvoRequest(BaseModel):
    wing: str = Field(..., min_length=1, max_length=64)
    room: str = Field(..., min_length=1, max_length=64)
    hall: str = Field(..., min_length=1, max_length=64)
    timestamp: str
    source: str = Field(..., min_length=1, max_length=256)
    source_id: Optional[str] = None
    content: str = Field(..., min_length=1)
    participants: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestDecisionRequest(BaseModel):
    wing: str = Field(..., min_length=1, max_length=64)
    room: str = Field(..., min_length=1, max_length=64)
    timestamp: str
    source: str = Field(..., min_length=1, max_length=256)
    title: str = Field(..., min_length=1, max_length=256)
    content: str = Field(..., min_length=1)
    rationale: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestTranscriptRequest(BaseModel):
    wing: str = Field(..., min_length=1, max_length=64)
    room: str = Field(..., min_length=1, max_length=64)
    timestamp: str
    source: str = Field(..., min_length=1, max_length=256)
    source_id: Optional[str] = None
    content: str = Field(..., min_length=1)
    speakers: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestVsWebhookRequest(BaseModel):
    taskId: str = Field(..., min_length=1, max_length=128)
    ticketId: Optional[str] = Field(None, max_length=64)
    title: str = Field(..., min_length=1, max_length=512)
    description: Optional[str] = None
    completionNote: Optional[str] = None
    commitHash: Optional[str] = Field(None, max_length=64)
    status: str = Field(..., max_length=32)
    initiativeId: Optional[str] = Field(None, max_length=128)
    verificationStatus: Optional[str] = Field(None, max_length=32)
    verificationOutput: Optional[str] = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2048)
    wing: Optional[str] = Field(None, max_length=64)
    room: Optional[str] = Field(None, max_length=64)
    k: int = Field(10, ge=1, le=20)
    mode: Optional[str] = Field(
        None, description="vector|lexical|hybrid (default: hybrid)"
    )
    filed_at_from: Optional[datetime] = Field(None, description="ISO datetime; drawers filed >= this (MP-ARCH-FUTURE-09)")
    filed_at_to: Optional[datetime] = Field(None, description="ISO datetime; drawers filed <= this (MP-ARCH-FUTURE-09)")


class SearchResult(BaseModel):
    content: str
    wing: str
    room: str
    source: str
    chunk_index: int
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
    query: str
    mode: str
    reranker_applied: bool = False
