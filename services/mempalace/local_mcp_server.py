#!/usr/bin/env python3
"""MemPalace MCP Server — LOCAL FORK (MP-ARCH-C-09)

Fork of upstream `mempalace.mcp_server` (v3.1.0, 946 lines) rewritten to
talk to the pg-backed storage layer in `services.mempalace.db` instead of
ChromaDB's PersistentClient.

Why: upstream package hardcodes `chromadb.PersistentClient(path=palace)`.
After MP-ARCH-C-01..C-07 migrated ingestion/search to Postgres+pgvector
the two stores drifted. This fork terminates that drift — MCP tools now
read from the same pg tables that ingestion writes to.

Compatibility surface preserved verbatim:
- Tool names, JSON-RPC method routing, input_schema shapes
- Return-value keys (total_drawers, wings, rooms, taxonomy, facts, ...)
- AAAK_SPEC + PALACE_PROTOCOL strings (identical to upstream — they are
  prompt context, not logic).
- JSON-RPC handle_request() dispatcher (unchanged from upstream).

Differences from upstream:
- Data source: PostgreSQL (mempalace db) via SQLAlchemy, not Chroma.
- Graph-traversal tools (traverse / find_tunnels / graph_stats) are
  stubbed — they were Chroma-metadata walks tied to that schema. Will be
  re-implemented on top of drawer metadata in a follow-up.
- Diary tools use the `drawers` table (wing=wing_<agent>, room=diary).
- --palace flag accepted for CLI compat but unused (db URL is the real
  source; passed via MEMPALACE_DB_* env or MEMPALACE_DB_URL).

Invoke:
    docker exec -i mempalace python /app/local_mcp_server.py [--palace /data/palace]

Or as a module if /app is on PYTHONPATH:
    python -m local_mcp_server

The --palace arg is retained only so the Mac MCP config from upstream
copies still work.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import logging
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any, Optional

# ── upstream helpers we still reuse (AAAK/protocol are prompt strings) ───────
try:
    from mempalace.config import sanitize_name, sanitize_content  # type: ignore
    from mempalace.version import __version__ as _UPSTREAM_VERSION  # type: ignore
except Exception:  # pragma: no cover — fall back to minimal impls
    _UPSTREAM_VERSION = "3.1.0-local"

    _NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")

    def sanitize_name(value: str, kind: str = "name") -> str:
        value = (value or "").strip()
        if not _NAME_RE.match(value):
            raise ValueError(f"invalid {kind}: {value!r}")
        return value

    def sanitize_content(value: str) -> str:
        if value is None:
            raise ValueError("content is empty")
        value = str(value)
        if not value.strip():
            raise ValueError("content is empty")
        if len(value) > 500_000:
            raise ValueError("content too large")
        return value


# ── pg-backed storage layer (same one ingest_server uses) ────────────────────
from sqlalchemy import func, select, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db import session_scope, writer_session_scope  # type: ignore  # /app/db
from db.embedder import OllamaEmbedder  # type: ignore
from db.models import Drawer  # type: ignore
from db.search import hybrid_search  # type: ignore


__version__ = f"{_UPSTREAM_VERSION}+pg.local"

logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stderr)
logger = logging.getLogger("mempalace_mcp_local")


# ── AAAK + protocol (verbatim from upstream) ─────────────────────────────────

PALACE_PROTOCOL = """IMPORTANT — MemPalace Memory Protocol:
1. ON WAKE-UP: Call mempalace_status to load palace overview + AAAK spec.
2. BEFORE RESPONDING about any person, project, or past event: call mempalace_search FIRST. Never guess — verify.
3. IF UNSURE about a fact (name, gender, age, relationship): say "let me check" and query the palace. Wrong is worse than slow.
4. AFTER EACH SESSION: call mempalace_diary_write to record what happened, what you learned, what matters.
5. WHEN FACTS CHANGE: call mempalace_add_drawer with the corrected fact; the old drawer can be deleted via mempalace_delete_drawer if it was explicitly wrong.

This protocol ensures the AI KNOWS before it speaks. Storage is not memory — but storage + this protocol = memory."""

AAAK_SPEC = """AAAK is a compressed memory dialect that MemPalace uses for efficient storage.
It is designed to be readable by both humans and LLMs without decoding.

FORMAT:
  ENTITIES: 3-letter uppercase codes. ALC=Alice, JOR=Jordan, RIL=Riley, MAX=Max, BEN=Ben.
  EMOTIONS: *action markers* before/during text. *warm*=joy, *fierce*=determined, *raw*=vulnerable, *bloom*=tenderness.
  STRUCTURE: Pipe-separated fields. FAM: family | PROJ: projects | ⚠: warnings/reminders.
  DATES: ISO format (2026-03-31). COUNTS: Nx = N mentions (e.g., 570x).
  IMPORTANCE: ★ to ★★★★★ (1-5 scale).
  HALLS: hall_facts, hall_events, hall_discoveries, hall_preferences, hall_advice.
  WINGS: wing_user, wing_agent, wing_team, wing_code, wing_myproject, wing_hardware, wing_ue5, wing_ai_research.
  ROOMS: Hyphenated slugs representing named ideas (e.g., chromadb-setup, gpu-pricing).

EXAMPLE:
  FAM: ALC→♡JOR | 2D(kids): RIL(18,sports) MAX(11,chess+swimming) | BEN(contributor)

Read AAAK naturally — expand codes mentally, treat *markers* as emotional context.
When WRITING AAAK: use entity codes, mark emotions, keep structure tight."""


# ── CLI compat (palace arg accepted, ignored) ────────────────────────────────

def _parse_args():
    parser = argparse.ArgumentParser(description="MemPalace MCP Server (pg-backed local fork)")
    parser.add_argument(
        "--palace",
        metavar="PATH",
        help="Legacy: path to chroma palace dir (ignored; db URL drives this fork)",
    )
    args, unknown = parser.parse_known_args()
    if unknown:
        logger.debug("Ignoring unknown args: %s", unknown)
    return args


_args = _parse_args()
_PALACE_PATH = os.environ.get("MEMPALACE_PALACE_PATH") or (_args.palace or "/data/palace")


# ── Write-ahead log (kept — audit trail for mutations) ───────────────────────

_WAL_DIR = Path(os.path.expanduser("~/.mempalace/wal"))
try:
    _WAL_DIR.mkdir(parents=True, exist_ok=True)
    _WAL_DIR.chmod(0o700)
except (OSError, NotImplementedError):
    pass
_WAL_FILE = _WAL_DIR / "write_log.jsonl"


def _wal_log(operation: str, params: dict, result: Optional[dict] = None) -> None:
    entry = {
        "timestamp": _dt.datetime.now().isoformat(),
        "operation": operation,
        "params": params,
        "result": result,
    }
    try:
        with open(_WAL_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str) + "\n")
        try:
            _WAL_FILE.chmod(0o600)
        except (OSError, NotImplementedError):
            pass
    except Exception as e:
        logger.error(f"WAL write failed: {e}")


# ── Embedder (lazy — search/add need it) ─────────────────────────────────────

_embedder: Optional[OllamaEmbedder] = None


def _get_embedder() -> OllamaEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = OllamaEmbedder()
    return _embedder


# ==================== READ TOOLS ====================


def tool_status() -> dict:
    """Palace overview: total drawers + wing/room counts (pg, not chroma)."""
    try:
        with session_scope() as s:
            total = s.execute(select(func.count(Drawer.id))).scalar_one()

            wing_rows = s.execute(
                select(Drawer.wing, func.count(Drawer.id)).group_by(Drawer.wing)
            ).all()
            wings = {row[0] or "unknown": int(row[1]) for row in wing_rows}

            room_rows = s.execute(
                select(Drawer.room, func.count(Drawer.id)).group_by(Drawer.room)
            ).all()
            rooms = {row[0] or "unknown": int(row[1]) for row in room_rows}
    except Exception as e:
        logger.exception("status failed")
        return {"error": f"db unavailable: {e}"}

    return {
        "total_drawers": int(total),
        "wings": wings,
        "rooms": rooms,
        "palace_path": _PALACE_PATH,
        "protocol": PALACE_PROTOCOL,
        "aaak_dialect": AAAK_SPEC,
        "backend": "postgres+pgvector",
        "server_version": __version__,
    }


def tool_list_wings() -> dict:
    try:
        with session_scope() as s:
            rows = s.execute(
                select(Drawer.wing, func.count(Drawer.id)).group_by(Drawer.wing)
            ).all()
        return {"wings": {row[0] or "unknown": int(row[1]) for row in rows}}
    except Exception as e:
        return {"error": str(e)}


def tool_list_rooms(wing: Optional[str] = None) -> dict:
    try:
        with session_scope() as s:
            stmt = select(Drawer.room, func.count(Drawer.id)).group_by(Drawer.room)
            if wing:
                stmt = stmt.where(Drawer.wing == wing)
            rows = s.execute(stmt).all()
        return {
            "wing": wing or "all",
            "rooms": {row[0] or "unknown": int(row[1]) for row in rows},
        }
    except Exception as e:
        return {"error": str(e)}


def tool_get_taxonomy() -> dict:
    try:
        with session_scope() as s:
            rows = s.execute(
                select(Drawer.wing, Drawer.room, func.count(Drawer.id)).group_by(
                    Drawer.wing, Drawer.room
                )
            ).all()
        taxonomy: dict[str, dict[str, int]] = {}
        for w, r, c in rows:
            w = w or "unknown"
            r = r or "unknown"
            taxonomy.setdefault(w, {})[r] = int(c)
        return {"taxonomy": taxonomy}
    except Exception as e:
        return {"error": str(e)}


def tool_search(
    query: str,
    limit: int = 10,
    wing: Optional[str] = None,
    room: Optional[str] = None,
) -> dict:
    """Hybrid RRF search (pgvector + tsvector). Mirrors /search endpoint shape."""
    try:
        with session_scope() as s:
            pairs = hybrid_search(
                s,
                query_text=query,
                limit=int(limit),
                wing=wing,
                room=room,
                embedder=_get_embedder(),
            )
            results = []
            for drawer, score in pairs:
                # MP-WIKI-IMPL-05: label wiki drawers so the caller agent sees
                # provenance ("this is curated peer knowledge, not session chatter")
                # without having to parse metadata JSONB. See ADR §Q7.
                content = drawer.content or ""
                meta = drawer.meta_ if drawer.meta_ is not None else {}
                if isinstance(meta, dict) and meta.get("type") == "wiki":
                    wiki_agent = meta.get("agent") or "unknown"
                    content = f"[wiki:{wiki_agent}] {content}"
                results.append(
                    {
                        "drawer_id": drawer.id,
                        "wing": drawer.wing,
                        "room": drawer.room,
                        "content": content,
                        "score": round(float(score), 6),
                        "source_file": drawer.source_file,
                        "chunk_index": drawer.chunk_index,
                    }
                )
        return {"query": query, "results": results, "total": len(results)}
    except Exception as e:
        logger.exception("search failed")
        return {"error": str(e)}


def tool_check_duplicate(content: str, threshold: float = 0.9) -> dict:
    """Find near-duplicates by dense cosine similarity."""
    try:
        emb = _get_embedder().embed_one(content)
        with session_scope() as s:
            dist_col = Drawer.embedding.cosine_distance(emb).label("distance")
            rows = (
                s.execute(select(Drawer, dist_col).order_by(dist_col).limit(5))
                .all()
            )
            duplicates = []
            for drawer, dist in rows:
                similarity = round(1.0 - float(dist), 3)
                if similarity >= float(threshold):
                    doc = drawer.content or ""
                    duplicates.append(
                        {
                            "id": drawer.id,
                            "wing": drawer.wing,
                            "room": drawer.room,
                            "similarity": similarity,
                            "content": doc[:200] + "..." if len(doc) > 200 else doc,
                        }
                    )
        return {"is_duplicate": len(duplicates) > 0, "matches": duplicates}
    except Exception as e:
        return {"error": str(e)}


def tool_get_aaak_spec() -> dict:
    return {"aaak_spec": AAAK_SPEC}


# ── Wake-up: session-start identity ritual (MP-FIX-AI-20260601) ──────────────
# Compact ~170-token payload: backend + drawer count per wing + AAAK + protocol.
# Long sections truncated so the whole payload fits ~700 chars (~170 tokens).

_WAKE_UP_AAAK_SHORT = (
    "AAAK: compressed memory dialect. "
    "Entities=3-letter codes (ALC, JOR). "
    "*markers*=emotion. Pipe-separated fields. "
    "Wings=wing_*, Rooms=hyphenated slugs."
)

_WAKE_UP_PROTOCOL_SHORT = (
    "Protocol: 1) wake_up at session start, "
    "2) search BEFORE answering about past events, "
    "3) say 'let me check' if unsure, "
    "4) diary_write after each session, "
    "5) add_drawer when facts change."
)


def _build_wake_up_payload() -> dict:
    """Compact L0+L1 identity context (~170 tokens). Standalone for token-count test."""
    try:
        with session_scope() as s:
            total = s.execute(select(func.count(Drawer.id))).scalar_one()
            wing_rows = s.execute(
                select(Drawer.wing, func.count(Drawer.id)).group_by(Drawer.wing)
            ).all()
            wings = {row[0] or "unknown": int(row[1]) for row in wing_rows}
    except Exception as e:
        # Fall back to identity-only payload if DB unreachable — the wake-up
        # ritual should never fail just because pg is down for a moment.
        return {
            "ritual": "wake_up",
            "backend": "postgres+pgvector",
            "server_version": __version__,
            "total_drawers": None,
            "wings": {},
            "aaak": _WAKE_UP_AAAK_SHORT,
            "protocol": _WAKE_UP_PROTOCOL_SHORT,
            "db_error": str(e)[:120],
        }
    return {
        "ritual": "wake_up",
        "backend": "postgres+pgvector",
        "server_version": __version__,
        "total_drawers": int(total),
        "wings": wings,
        "aaak": _WAKE_UP_AAAK_SHORT,
        "protocol": _WAKE_UP_PROTOCOL_SHORT,
    }


def tool_wake_up() -> dict:
    """Session-start identity ritual — returns compact L0+L1 context."""
    return _build_wake_up_payload()


# ── Graph-traversal tools: STUBBED in fork ──────────────────────────────────
# Upstream palace_graph walked Chroma metadata. Needs reimplementation on top
# of pg drawer metadata. Tracked as follow-up to MP-ARCH-C-09.

def tool_traverse_graph(start_room: str, max_hops: int = 2) -> dict:
    return {
        "stub": True,
        "reason": "graph traversal not yet ported to pg backend (MP-ARCH-C-09 follow-up)",
        "start_room": start_room,
        "max_hops": int(max_hops),
    }


def tool_find_tunnels(wing_a: Optional[str] = None, wing_b: Optional[str] = None) -> dict:
    return {
        "stub": True,
        "reason": "tunnels discovery not yet ported to pg backend (MP-ARCH-C-09 follow-up)",
        "wing_a": wing_a,
        "wing_b": wing_b,
    }


def tool_graph_stats() -> dict:
    """Light replacement: count distinct wings/rooms + cross-wing room overlap."""
    try:
        with session_scope() as s:
            total_drawers = s.execute(select(func.count(Drawer.id))).scalar_one()
            n_wings = s.execute(select(func.count(func.distinct(Drawer.wing)))).scalar_one()
            n_rooms = s.execute(
                select(func.count(func.distinct(func.concat(Drawer.wing, "/", Drawer.room))))
            ).scalar_one()
            # Rooms shared across >1 wing = tunnel candidates
            sub = (
                select(Drawer.room, func.count(func.distinct(Drawer.wing)).label("n_wings"))
                .group_by(Drawer.room)
                .subquery()
            )
            tunnel_rooms = s.execute(
                select(func.count()).where(sub.c.n_wings > 1)
            ).scalar_one()
        return {
            "total_drawers": int(total_drawers),
            "wings": int(n_wings),
            "rooms": int(n_rooms),
            "tunnel_rooms": int(tunnel_rooms),
            "note": "simplified graph stats — full traversal deferred",
        }
    except Exception as e:
        return {"error": str(e)}


# ==================== WRITE TOOLS ====================


def tool_add_drawer(
    wing: str,
    room: str,
    content: str,
    source_file: Optional[str] = None,
    added_by: str = "mcp",
) -> dict:
    """Insert verbatim content into pg drawers table. Idempotent via source_id."""
    try:
        wing = sanitize_name(wing, "wing")
        room = sanitize_name(room, "room")
        content = sanitize_content(content)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    # Deterministic id mirroring upstream shape (for stable dedup)
    drawer_hash = hashlib.sha256((wing + room + content[:100]).encode()).hexdigest()[:24]
    drawer_id = f"drawer_{wing}_{room}_{drawer_hash}"
    # source_id used for ON CONFLICT DO NOTHING idempotency (unique index)
    source_id_value = f"mcp:{drawer_hash}"

    _wal_log(
        "add_drawer",
        {
            "drawer_id": drawer_id,
            "wing": wing,
            "room": room,
            "added_by": added_by,
            "content_length": len(content),
            "content_preview": content[:200],
        },
    )

    try:
        vec = _get_embedder().embed_one(content)
    except Exception as e:
        return {"success": False, "error": f"embed failed: {e}"}

    try:
        with writer_session_scope() as s:
            # Ensure wing + room FK rows exist (RESTRICT on drawers→rooms)
            s.execute(
                pg_insert(
                    # wings table
                    __import__("db.models", fromlist=["Wing"]).Wing.__table__  # type: ignore
                ).values(name=wing).on_conflict_do_nothing(index_elements=["name"])
            )
            s.execute(
                pg_insert(
                    __import__("db.models", fromlist=["Room"]).Room.__table__  # type: ignore
                )
                .values(wing=wing, name=room)
                .on_conflict_do_nothing(index_elements=["wing", "name"])
            )

            values = {
                "id": drawer_id,
                "wing": wing,
                "room": room,
                "content": content,
                "embedding": vec,
                "metadata": {"added_by": added_by, "via": "local_mcp_server"},
                "source": "mcp",
                "source_id": source_id_value,
                "source_file": source_file or "",
                "chunk_index": 0,
                "added_by": added_by,
            }
            stmt = (
                pg_insert(Drawer.__table__)
                .values(**values)
                .on_conflict_do_nothing(index_elements=["source_id"])
            )
            result = s.execute(stmt)

        if result.rowcount and result.rowcount > 0:
            logger.info(f"Filed drawer: {drawer_id} → {wing}/{room}")
            return {"success": True, "drawer_id": drawer_id, "wing": wing, "room": room}
        return {
            "success": True,
            "reason": "already_exists",
            "drawer_id": drawer_id,
            "wing": wing,
            "room": room,
        }
    except Exception as e:
        logger.exception("add_drawer failed")
        return {"success": False, "error": str(e)}


def tool_delete_drawer(drawer_id: str) -> dict:
    """Delete a single drawer by primary key."""
    try:
        with writer_session_scope() as s:
            existing = s.get(Drawer, drawer_id)
            if existing is None:
                return {"success": False, "error": f"Drawer not found: {drawer_id}"}
            meta_snapshot = {
                "wing": existing.wing,
                "room": existing.room,
                "content_preview": (existing.content or "")[:200],
            }
            _wal_log("delete_drawer", {"drawer_id": drawer_id, **meta_snapshot})
            s.execute(delete(Drawer).where(Drawer.id == drawer_id))
        logger.info(f"Deleted drawer: {drawer_id}")
        return {"success": True, "drawer_id": drawer_id}
    except Exception as e:
        return {"success": False, "error": str(e)}


# Knowledge Graph tools removed in MP-ARCH-FUTURE-03 (2026-04-11).
# See docs/adr/mempalace-kg-decision-20260411.md for rationale + revival path.


# ==================== AGENT DIARY ====================


def tool_diary_write(agent_name: str, entry: str, topic: str = "general") -> dict:
    """Write a diary entry into drawers (wing=wing_<agent>, room=diary)."""
    try:
        agent_name = sanitize_name(agent_name, "agent_name")
        entry = sanitize_content(entry)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    wing = f"wing_{agent_name.lower().replace(' ', '_')}"
    # sanitize_name again to match regex
    try:
        wing = sanitize_name(wing, "wing")
    except ValueError as e:
        return {"success": False, "error": f"invalid wing: {e}"}
    room = "diary"

    now = _dt.datetime.now(tz=_dt.timezone.utc)
    digest = hashlib.sha256(entry[:50].encode()).hexdigest()[:12]
    entry_id = f"diary_{wing}_{now.strftime('%Y%m%d_%H%M%S')}_{digest}"
    source_id_value = f"diary:{wing}:{now.strftime('%Y%m%d%H%M%S')}:{digest}"

    _wal_log(
        "diary_write",
        {
            "agent_name": agent_name,
            "topic": topic,
            "entry_id": entry_id,
            "entry_preview": entry[:200],
        },
    )

    try:
        vec = _get_embedder().embed_one(entry)
    except Exception as e:
        return {"success": False, "error": f"embed failed: {e}"}

    try:
        with writer_session_scope() as s:
            from db.models import Wing as _WingM, Room as _RoomM  # local import
            s.execute(
                pg_insert(_WingM.__table__)
                .values(name=wing)
                .on_conflict_do_nothing(index_elements=["name"])
            )
            s.execute(
                pg_insert(_RoomM.__table__)
                .values(wing=wing, name=room)
                .on_conflict_do_nothing(index_elements=["wing", "name"])
            )
            s.execute(
                pg_insert(Drawer.__table__)
                .values(
                    id=entry_id,
                    wing=wing,
                    room=room,
                    content=entry,
                    embedding=vec,
                    metadata={
                        "type": "diary_entry",
                        "topic": topic,
                        "agent": agent_name,
                        "date": now.strftime("%Y-%m-%d"),
                        "hall": "hall_diary",
                    },
                    source="diary",
                    source_id=source_id_value,
                    source_file=f"diary/{agent_name}",
                    chunk_index=0,
                    added_by=f"diary:{agent_name}",
                )
                .on_conflict_do_nothing(index_elements=["source_id"])
            )
        logger.info(f"Diary entry: {entry_id} → {wing}/diary/{topic}")
        return {
            "success": True,
            "entry_id": entry_id,
            "agent": agent_name,
            "topic": topic,
            "timestamp": now.isoformat(),
        }
    except Exception as e:
        logger.exception("diary_write failed")
        return {"success": False, "error": str(e)}


def tool_diary_read(agent_name: str, last_n: int = 10) -> dict:
    wing = f"wing_{agent_name.lower().replace(' ', '_')}"
    try:
        with session_scope() as s:
            stmt = (
                select(Drawer)
                .where(Drawer.wing == wing, Drawer.room == "diary")
                .order_by(Drawer.filed_at.desc())
                .limit(int(last_n))
            )
            rows = list(s.scalars(stmt))
            total_stmt = select(func.count(Drawer.id)).where(
                Drawer.wing == wing, Drawer.room == "diary"
            )
            total = s.execute(total_stmt).scalar_one()

        if not rows:
            return {"agent": agent_name, "entries": [], "message": "No diary entries yet."}

        entries = [
            {
                "date": (d.meta_ or {}).get("date") or (d.filed_at.strftime("%Y-%m-%d") if d.filed_at else ""),
                "timestamp": d.filed_at.isoformat() if d.filed_at else "",
                "topic": (d.meta_ or {}).get("topic", ""),
                "content": d.content,
            }
            for d in rows
        ]
        return {
            "agent": agent_name,
            "entries": entries,
            "total": int(total),
            "showing": len(entries),
        }
    except Exception as e:
        return {"error": str(e)}


# ==================== MCP PROTOCOL ====================

TOOLS = {
    "mempalace_wake_up": {
        "description": (
            "Session-start identity ritual. Returns compact L0+L1 context "
            "(~170 tokens): backend, drawer count per wing, AAAK dialect "
            "summary, palace protocol. Call this FIRST in a new session."
        ),
        "input_schema": {"type": "object", "properties": {}},
        "handler": tool_wake_up,
    },
    "mempalace_status": {
        "description": "Palace overview — total drawers, wing and room counts",
        "input_schema": {"type": "object", "properties": {}},
        "handler": tool_status,
    },
    "mempalace_list_wings": {
        "description": "List all wings with drawer counts",
        "input_schema": {"type": "object", "properties": {}},
        "handler": tool_list_wings,
    },
    "mempalace_list_rooms": {
        "description": "List rooms within a wing (or all rooms if no wing given)",
        "input_schema": {
            "type": "object",
            "properties": {
                "wing": {"type": "string", "description": "Wing to list rooms for (optional)"},
            },
        },
        "handler": tool_list_rooms,
    },
    "mempalace_get_taxonomy": {
        "description": "Full taxonomy: wing → room → drawer count",
        "input_schema": {"type": "object", "properties": {}},
        "handler": tool_get_taxonomy,
    },
    "mempalace_get_aaak_spec": {
        "description": "Get the AAAK dialect specification — the compressed memory format MemPalace uses.",
        "input_schema": {"type": "object", "properties": {}},
        "handler": tool_get_aaak_spec,
    },
    "mempalace_traverse": {
        "description": "Walk the palace graph (STUBBED in pg fork — follow-up ticket).",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_room": {"type": "string"},
                "max_hops": {"type": "integer"},
            },
            "required": ["start_room"],
        },
        "handler": tool_traverse_graph,
    },
    "mempalace_find_tunnels": {
        "description": "Find rooms that bridge two wings (STUBBED in pg fork — follow-up ticket).",
        "input_schema": {
            "type": "object",
            "properties": {
                "wing_a": {"type": "string"},
                "wing_b": {"type": "string"},
            },
        },
        "handler": tool_find_tunnels,
    },
    "mempalace_graph_stats": {
        "description": "Palace graph overview (simplified — full traversal stubbed).",
        "input_schema": {"type": "object", "properties": {}},
        "handler": tool_graph_stats,
    },
    "mempalace_search": {
        "description": "Hybrid RRF search over pgvector + tsvector. Returns drawers with scores.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for"},
                "limit": {"type": "integer", "description": "Max results (default 10)"},
                "wing": {"type": "string", "description": "Filter by wing (optional)"},
                "room": {"type": "string", "description": "Filter by room (optional)"},
            },
            "required": ["query"],
        },
        "handler": tool_search,
    },
    "mempalace_check_duplicate": {
        "description": "Check if content already exists before filing (cosine similarity).",
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "threshold": {"type": "number", "description": "0-1 (default 0.9)"},
            },
            "required": ["content"],
        },
        "handler": tool_check_duplicate,
    },
    "mempalace_add_drawer": {
        "description": "File verbatim content into the palace (pg). Idempotent via deterministic source_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "wing": {"type": "string"},
                "room": {"type": "string"},
                "content": {"type": "string"},
                "source_file": {"type": "string"},
                "added_by": {"type": "string"},
            },
            "required": ["wing", "room", "content"],
        },
        "handler": tool_add_drawer,
    },
    "mempalace_delete_drawer": {
        "description": "Delete a drawer by ID. Irreversible.",
        "input_schema": {
            "type": "object",
            "properties": {
                "drawer_id": {"type": "string"},
            },
            "required": ["drawer_id"],
        },
        "handler": tool_delete_drawer,
    },
    "mempalace_diary_write": {
        "description": "Write to your personal agent diary in AAAK format. Stored as drawer in wing_<agent>/diary.",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string"},
                "entry": {"type": "string"},
                "topic": {"type": "string"},
            },
            "required": ["agent_name", "entry"],
        },
        "handler": tool_diary_write,
    },
    "mempalace_diary_read": {
        "description": "Read your recent diary entries from wing_<agent>/diary.",
        "input_schema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string"},
                "last_n": {"type": "integer"},
            },
            "required": ["agent_name"],
        },
        "handler": tool_diary_read,
    },
}


SUPPORTED_PROTOCOL_VERSIONS = [
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
]


def handle_request(request: dict) -> Optional[dict]:
    method = request.get("method", "")
    params = request.get("params", {}) or {}
    req_id = request.get("id")

    if method == "initialize":
        client_version = params.get("protocolVersion", SUPPORTED_PROTOCOL_VERSIONS[-1])
        negotiated = (
            client_version
            if client_version in SUPPORTED_PROTOCOL_VERSIONS
            else SUPPORTED_PROTOCOL_VERSIONS[0]
        )
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": negotiated,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "mempalace", "version": __version__},
            },
        }
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": [
                    {"name": n, "description": t["description"], "inputSchema": t["input_schema"]}
                    for n, t in TOOLS.items()
                ]
            },
        }
    if method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments") or {}
        if tool_name not in TOOLS:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"},
            }
        schema_props = TOOLS[tool_name]["input_schema"].get("properties", {})
        for key, value in list(tool_args.items()):
            prop_schema = schema_props.get(key, {})
            declared_type = prop_schema.get("type")
            if declared_type == "integer" and not isinstance(value, int):
                try:
                    tool_args[key] = int(value)
                except (TypeError, ValueError):
                    pass
            elif declared_type == "number" and not isinstance(value, (int, float)):
                try:
                    tool_args[key] = float(value)
                except (TypeError, ValueError):
                    pass
        try:
            result = TOOLS[tool_name]["handler"](**tool_args)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2, default=str)}]},
            }
        except Exception:
            logger.exception(f"Tool error in {tool_name}")
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32000, "message": "Internal tool error"},
            }

    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"Unknown method: {method}"},
    }


def main() -> None:
    logger.info(f"MemPalace MCP Server (local pg fork) starting — {__version__}")
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            request = json.loads(line)
            response = handle_request(request)
            if response is not None:
                sys.stdout.write(json.dumps(response, default=str) + "\n")
                sys.stdout.flush()
        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Server error: {e}")


if __name__ == "__main__":
    main()
