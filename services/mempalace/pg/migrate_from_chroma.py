"""
MP-ARCH-C-05: One-shot migration Chroma → pgvector for MemPalace.

Reads all drawers from /data/palace/chroma.sqlite3 via chromadb client,
reads kg_entities + kg_triples from /data/palace/knowledge_graph.sqlite3,
writes into pg mempalace database via the new db/ layer.

Run inside mempalace container with MEMPALACE_DB_URL set.

Idempotent: uses source_id UNIQUE constraint + ON CONFLICT DO NOTHING.
Legacy Chroma rows without stable IDs get synthesized source_id = sha256(content)[:16].

After successful run, the ivfflat index must be REINDEX'ed to rebuild
centroids from real data.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from typing import Any

import chromadb
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db.engine import session_scope, get_engine
from db.models import Drawer, Wing, Room


PALACE_PATH = os.environ.get("PALACE_PATH", "/data/palace")
BATCH = 500


def _parse_ts(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, (int, float)):
        return datetime.fromtimestamp(val, tz=timezone.utc)
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except ValueError:
            try:
                return datetime.fromisoformat(val.split(".")[0])
            except ValueError:
                return None
    return None


def _synth_source_id(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def migrate_drawers() -> tuple[int, int, int]:
    """Returns (inserted, skipped, errors)."""
    client = chromadb.PersistentClient(path=PALACE_PATH)
    col = client.get_collection("mempalace_drawers")
    total = col.count()
    print(f"[migrate] chroma collection has {total} drawers")

    inserted = 0
    skipped = 0
    errors = 0
    offset = 0

    # Ensure wings/rooms needed by drawers exist — we'll auto-create missing ones
    known_rooms: set[tuple[str, str]] = set()

    with session_scope() as sess:
        for (w, r) in sess.execute(text("SELECT wing, name FROM rooms")):
            known_rooms.add((w, r))
        existing_wings: set[str] = set(
            row[0] for row in sess.execute(text("SELECT name FROM wings"))
        )

    while offset < total:
        batch = col.get(
            limit=BATCH,
            offset=offset,
            include=["documents", "embeddings", "metadatas"],
        )
        ids_batch = batch["ids"]
        docs = batch["documents"]
        embs = batch["embeddings"]
        metas = batch["metadatas"]
        if not ids_batch:
            break

        rows: list[dict] = []
        for cid, content, emb, meta in zip(ids_batch, docs, embs, metas):
            if content is None or emb is None:
                errors += 1
                continue
            meta = meta or {}
            wing = meta.get("wing") or "wing_vs"
            room = meta.get("room") or "room_decisions"

            # Auto-create missing wings/rooms inline during migration
            if wing not in existing_wings:
                with session_scope() as s2:
                    s2.execute(
                        text(
                            "INSERT INTO wings (name, description) VALUES (:n, :d) ON CONFLICT DO NOTHING"
                        ),
                        {"n": wing, "d": f"Auto-created during C-05 migration"},
                    )
                existing_wings.add(wing)
            if (wing, room) not in known_rooms:
                with session_scope() as s2:
                    s2.execute(
                        text(
                            "INSERT INTO rooms (wing, name, description) VALUES (:w, :n, :d) ON CONFLICT DO NOTHING"
                        ),
                        {
                            "w": wing,
                            "n": room,
                            "d": f"Auto-created during C-05 migration",
                        },
                    )
                known_rooms.add((wing, room))

            source_id = meta.get("source_id") or _synth_source_id(content)
            source = meta.get("source") or meta.get("source_file") or "chroma-legacy"
            source_file = meta.get("source_file")
            chunk_index = meta.get("chunk_index")
            filed_at = _parse_ts(meta.get("filed_at")) or datetime.now(timezone.utc)
            added_by = meta.get("added_by")

            clean_meta = {
                k: v
                for k, v in meta.items()
                if k
                not in {
                    "wing",
                    "room",
                    "source_id",
                    "source",
                    "source_file",
                    "chunk_index",
                    "filed_at",
                    "added_by",
                }
            }
            clean_meta["embedding_model"] = "nomic-embed-text"
            clean_meta["migrated_from"] = "chroma"
            clean_meta["migrated_at"] = datetime.now(timezone.utc).isoformat()
            clean_meta["legacy_chroma_id"] = cid

            rows.append(
                {
                    "id": cid,
                    "wing": wing,
                    "room": room,
                    "content": content,
                    "embedding": list(emb),
                    "metadata": clean_meta,
                    "source": source,
                    "source_id": source_id,
                    "source_file": source_file,
                    "chunk_index": chunk_index,
                    "filed_at": filed_at,
                    "added_by": added_by,
                }
            )

        if rows:
            with session_scope() as sess:
                stmt = pg_insert(Drawer.__table__).values(rows)
                # Use id (primary key) for idempotency — source_id has partial unique
                # index which pg ON CONFLICT does not match via index_elements alone.
                stmt = stmt.on_conflict_do_nothing(index_elements=["id"])
                result = sess.execute(stmt)
                batch_inserted = result.rowcount or 0
                inserted += batch_inserted
                skipped += len(rows) - batch_inserted
        offset += BATCH
        print(f"[migrate] progress {offset}/{total} (inserted={inserted} skipped={skipped})")

    return inserted, skipped, errors


def migrate_kg() -> tuple[int, int]:
    """KG migration disabled.

    Knowledge Graph tables (kg_entities, kg_triples) were dropped in
    MP-ARCH-FUTURE-03 (2026-04-11). This function remains as a stub so
    the one-shot migration script from MP-ARCH-C-07 still runs, but it
    no longer imports KG models. See docs/adr/mempalace-kg-decision-20260411.md.
    """
    print("[migrate-kg] disabled — KG tables dropped in MP-ARCH-FUTURE-03")
    return 0, 0


def reindex_vector() -> None:
    print("[migrate] REINDEX drawers_embedding_ivfflat — may take a moment")
    eng = get_engine()
    with eng.connect() as conn:
        conn.execute(text("REINDEX INDEX drawers_embedding_ivfflat"))
        conn.commit()


def verify() -> None:
    print("[migrate] verification")
    with session_scope() as sess:
        drawers_count = sess.execute(text("SELECT COUNT(*) FROM drawers")).scalar()
        print(f"  drawers: {drawers_count}")

        # spot check: a few random drawers
        rows = sess.execute(
            text(
                "SELECT id, wing, room, LEFT(content, 80) as preview FROM drawers ORDER BY random() LIMIT 3"
            )
        )
        for r in rows:
            print(f"  sample: {r.wing}/{r.room} — {r.preview}")


def main() -> int:
    dry = "--dry-run" in sys.argv
    if dry:
        client = chromadb.PersistentClient(path=PALACE_PATH)
        col = client.get_collection("mempalace_drawers")
        print(f"[dry-run] chroma drawers: {col.count()}")
        # KG migration disabled (MP-ARCH-FUTURE-03)
        return 0

    inserted, skipped, errors = migrate_drawers()
    print(
        f"\n[migrate] drawers: inserted={inserted} skipped={skipped} errors={errors}"
    )

    ent, tri = migrate_kg()
    print(f"[migrate] kg_entities={ent} kg_triples={tri}")

    reindex_vector()
    verify()
    return 0


if __name__ == "__main__":
    sys.exit(main())
