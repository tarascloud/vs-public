"""SQLAlchemy declarative models mirroring services/mempalace/pg/schema.sql.

The source of truth for DDL is `pg/schema.sql` (MP-ARCH-C-01). These models
must not diverge — any schema change must be applied in schema.sql first and
migrated via pg/migrations/.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Computed,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


EMBED_DIM = 768  # nomic-embed-text


class Base(DeclarativeBase):
    pass


class Wing(Base):
    __tablename__ = "wings"

    name: Mapped[str] = mapped_column(Text, primary_key=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    rooms: Mapped[list["Room"]] = relationship(back_populates="wing_obj", cascade="all, delete-orphan")


class Room(Base):
    __tablename__ = "rooms"

    wing: Mapped[str] = mapped_column(
        Text, ForeignKey("wings.name", ondelete="CASCADE"), primary_key=True
    )
    name: Mapped[str] = mapped_column(Text, primary_key=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    wing_obj: Mapped[Wing] = relationship(back_populates="rooms")


class Drawer(Base):
    __tablename__ = "drawers"
    __table_args__ = (
        ForeignKeyConstraint(
            ["wing", "room"], ["rooms.wing", "rooms.name"], ondelete="RESTRICT"
        ),
    )

    id: Mapped[str] = mapped_column(
        Text, primary_key=True, server_default=func.gen_random_uuid().cast(Text)
    )
    wing: Mapped[str] = mapped_column(Text, nullable=False)
    room: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # GENERATED ALWAYS tsvector — read-only from ORM perspective
    content_tsv: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('simple', content)", persisted=True),
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBED_DIM), nullable=False)
    # Note: "metadata" is reserved on DeclarativeBase, so attribute is meta_ but column is metadata
    meta_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )
    source: Mapped[Optional[str]] = mapped_column(Text)
    source_id: Mapped[Optional[str]] = mapped_column(Text)
    source_file: Mapped[Optional[str]] = mapped_column(Text)
    chunk_index: Mapped[Optional[int]] = mapped_column(Integer)
    filed_at: Mapped[_dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    added_by: Mapped[Optional[str]] = mapped_column(Text)
    scrubbed_at: Mapped[Optional[_dt.datetime]] = mapped_column(DateTime(timezone=True))

# Knowledge Graph models removed in MP-ARCH-FUTURE-03 (2026-04-11).
# See docs/adr/mempalace-kg-decision-20260411.md
