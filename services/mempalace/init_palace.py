#!/usr/bin/env python3
"""
init_palace.py — Idempotent palace initializer for Vibe Studio.

Creates wing + room directory structure and seeds PostgreSQL tables (wings, rooms)
so wings/rooms are discoverable before any ingestion happens.

Wings defined in ADR: docs/adr/mempalace.md §6.2
Rooms defined per-wing based on domain structure.

Usage (inside container):
    python /app/init_palace.py [--palace /data/palace] [--dry-run]

    Environment variables:
        PALACE_PATH  — palace root directory (default: /data/palace)
        DATABASE_URL — PostgreSQL connection string
                       (default: postgresql://mempalace:mempalace@pg:5432/mempalace)

Idempotency: safe to run multiple times — uses INSERT ... ON CONFLICT DO UPDATE.

Migrated from ChromaDB to PostgreSQL (pgvector) in REV2-08.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

try:
    import psycopg2
except ModuleNotFoundError:  # container image ships psycopg 3 (MP-ARCH-C-03)
    import psycopg as psycopg2


logging.basicConfig(
    level=logging.INFO,
    format="[init_palace] %(levelname)s %(message)s",
)
log = logging.getLogger("init_palace")

# ── Palace taxonomy (ADR §6.2 + domain knowledge) ─────────────────────────────
#
# Structure: wing → list of rooms
# Halls (facts/events/discoveries/preferences/advice/decisions) are metadata
# fields on drawers — not directories. They are defined here for reference only.
#
# 2026-04-11 (MP-FIX-20260411-05): shrunk to match reality.
#   Only wings/rooms that have active ingesters (and therefore real drawers)
#   are declared here. Empty wings/rooms create misleading sentinels and
#   confuse palace introspection (audit.py, mempalace_status).
#
#   Removed wings (no ingester yet — re-add when ingester is built):
#     - wing_jobfinder (rooms: vacancies, applications, profile, searches,
#                       qa_bank, scoring, analytics)
#     - wing_trade     (rooms: strategies, backtests, live, research)
#     - wing_owner     (rooms: preferences, goals, people, locations, reflections)
#
#   Removed rooms from kept wings (no ingester writes there):
#     - wing_pd       dropped: finance, investments, trading, health, gym,
#                              reports, ml  (only room_ai_chat has ingester)
#     - wing_vs       dropped: agents, infra, security, mempalace
#                              (ingest_vs_db only writes decisions + tasks)
#     - wing_workflow dropped: feedback, rules, deployments
#                              (only commands + sessions are ingested)
#
#   After shrink: 4 wings, 9 rooms, all non-empty in production.
#
WINGS: dict[str, dict] = {
    "wing_pd": {
        "description": "Personal Dashboard — AI chat діалоги (Gemini/Groq)",
        "rooms": [
            {
                "name": "room_ai_chat",
                "description": "PD AI chat діалоги (Gemini/Groq) — фінанси, здоров'я, трейдинг",
            },
        ],
    },
    "wing_vs": {
        "description": "Vibe Studio — задачі, ініціативи, ADR рішення",
        "rooms": [
            {
                "name": "room_decisions",
                "description": "Архітектурні рішення: чому X, trade-offs, ADRs",
            },
            {
                "name": "room_tasks",
                "description": "Task/Initiative описи (general) — fallback room",
            },
            {
                "name": "room_mempalace",
                "description": "MemPalace-специфічні задачі: Chroma, embeddings, ingesters, retrieval",
            },
            {
                "name": "room_security",
                "description": "Security задачі: secrets, auth, XSS, CSRF, scrubber, audit",
            },
            {
                "name": "room_infra",
                "description": "Infra задачі: Docker, compose, nginx, Cloudflare, backups, DNS",
            },
            {
                "name": "room_agents",
                "description": "Задачі що стосуються агентів/Claude/субагентів",
            },
        ],
    },
    "wing_shuleansky": {
        "description": "Подкаст Shuleansky — транскрипти, сценарії, гості, теми",
        "rooms": [
            {
                "name": "room_transcripts",
                "description": "Повні транскрипти епізодів (faster-whisper large-v3)",
            },
            {
                "name": "room_scripts",
                "description": "Сценарії, нотатки до епізодів, ідеї",
            },
            {
                "name": "room_guests",
                "description": "Інформація про гостей, контекст розмов",
            },
            {
                "name": "room_topics",
                "description": "Теми, що обговорювались: бізнес, технології, особисте",
            },
        ],
    },
    "wing_workflow": {
        "description": "Workflow VS — Claude Code сесії, голосові команди, feedback",
        "rooms": [
            {
                "name": "room_commands",
                "description": "Голосові команди: байбай, роби, шоти, шотам — результати та проблеми",
            },
            {
                "name": "room_sessions",
                "description": "Claude Code session logs (Mac + VPS) — повний діалог",
            },
            {
                "name": "room_feedback",
                "description": "Користувацький фідбек: feedback_*.md правила, TaskFeedback записи",
            },
        ],
    },
}

# TODO: re-add these wings/rooms when dedicated ingesters are built.
# See MP-FIX-20260411-05 and mempalace.md ADR §6.2 for original taxonomy.
#
# wing_jobfinder — needs ingester reading jobfinder.vacancies, applications, etc.
# wing_trade     — needs ingester reading freqtrade DB + logs
# wing_owner     — needs ingester for personal preferences / goals / reflections
# wing_pd/room_finance,investments,trading,health,gym,reports,ml — need PD DB ingester
# wing_workflow/room_rules,deployments — need git + deploy log ingesters
#
# Re-added in MP-IMPROVE-20260411-09 (keyword-routed from ingest_vs_db):
#   wing_vs/room_mempalace, room_security, room_infra, room_agents
#   wing_workflow/room_feedback  (also receives MEMORY.md feedback_*.md ingest)

# Halls (metadata fields) — for reference only, not directories.
# Halls are stored as metadata on drawers (not as directories and not as a
# separate manifest). See mempalace/docs/knowledge-graph.md for the canonical
# description of KG storage and why kg.json was removed (MP-IMPROVE-20260411-12).
HALLS = ["hall_facts", "hall_events", "hall_discoveries", "hall_preferences", "hall_advice", "hall_decisions"]
_ = HALLS  # kept for documentation + future halls-aware tooling


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Initialize MemPalace wings + rooms (idempotent)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python /app/init_palace.py
    python /app/init_palace.py --palace /data/palace
    python /app/init_palace.py --dry-run
        """,
    )
    parser.add_argument(
        "--palace",
        default=os.environ.get("PALACE_PATH", "/data/palace"),
        help="Palace root directory (default: $PALACE_PATH or /data/palace)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be created without writing anything",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get(
            "DATABASE_URL",
            "postgresql://mempalace:mempalace@pg:5432/mempalace",
        ),
        help="PostgreSQL connection string (default: $DATABASE_URL)",
    )
    return parser.parse_args()


def ensure_dir(path: Path, mode: int = 0o700, dry_run: bool = False) -> bool:
    """Create directory if it does not exist. Returns True if created."""
    if path.exists():
        return False
    if dry_run:
        log.info("[DRY-RUN] would create dir: %s", path)
        return True
    path.mkdir(parents=True, exist_ok=True)
    try:
        path.chmod(mode)
    except OSError:
        pass
    log.info("created: %s", path)
    return True


def write_readme(path: Path, title: str, description: str, dry_run: bool = False) -> None:
    """Write a README.md into a wing/room directory if one does not exist."""
    readme = path / "README.md"
    if readme.exists():
        return
    content = f"# {title}\n\n{description}\n\n_Auto-generated by init_palace.py — do not edit manually._\n"
    if dry_run:
        log.info("[DRY-RUN] would write: %s", readme)
        return
    readme.write_text(content, encoding="utf-8")


def connect_pg(database_url: str) -> psycopg2.extensions.connection:
    """Connect to PostgreSQL. Raises on failure."""
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    log.info("connected to PostgreSQL")
    return conn


def seed_wings_and_rooms(
    conn: psycopg2.extensions.connection,
    dry_run: bool = False,
) -> tuple[int, int]:
    """Upsert all wings and rooms into PostgreSQL.

    Uses INSERT ... ON CONFLICT DO UPDATE to be fully idempotent.
    Returns (upserted_wings, upserted_rooms) counts.
    """
    upserted_wings = 0
    upserted_rooms = 0

    if dry_run:
        for wing_name, wing_info in WINGS.items():
            log.info("[DRY-RUN] would upsert wing: %s", wing_name)
            upserted_wings += 1
            for room in wing_info["rooms"]:
                log.info("[DRY-RUN] would upsert room: %s / %s", wing_name, room["name"])
                upserted_rooms += 1
        return upserted_wings, upserted_rooms

    with conn.cursor() as cur:
        for wing_name, wing_info in WINGS.items():
            cur.execute(
                """
                INSERT INTO wings (name, description)
                VALUES (%s, %s)
                ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
                """,
                (wing_name, wing_info["description"]),
            )
            upserted_wings += 1
            log.info("upserted wing: %s", wing_name)

            for room in wing_info["rooms"]:
                cur.execute(
                    """
                    INSERT INTO rooms (wing, name, description)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (wing, name) DO UPDATE SET description = EXCLUDED.description
                    """,
                    (wing_name, room["name"], room["description"]),
                )
                upserted_rooms += 1
                log.info("upserted room: %s / %s", wing_name, room["name"])

        conn.commit()

    return upserted_wings, upserted_rooms


# NOTE (MP-IMPROVE-20260411-12): kg.json manifest was removed.
#
# Previously this module wrote a `kg.json` file at the palace root summarising
# wings/rooms/halls. Nothing in the upstream `mempalace` package (3.1.0) or in
# our ingesters/search paths ever read it — confirmed by exhaustive grep of
# /usr/local/lib/python3.12/site-packages/mempalace/ and services/mempalace/.
#
# The real knowledge graph lives in PostgreSQL tables kg_entities and kg_triples.
# Wings and rooms are discoverable from:
#   1. the directory layout under palace/wings/ and palace/drawers/ (written
#      by this script), and
#   2. the PostgreSQL wings/rooms tables seeded by seed_wings_and_rooms().


def main() -> int:
    args = parse_args()
    palace_root = Path(args.palace).resolve()
    dry_run = args.dry_run

    log.info("palace: %s%s", palace_root, " [DRY-RUN]" if dry_run else "")

    # ── 1. Ensure top-level palace directories ──────────────────────────────
    for top_dir in ["wings", "drawers"]:
        ensure_dir(palace_root / top_dir, dry_run=dry_run)

    # ── 2. Seed PostgreSQL wings + rooms ───────────────────────────────────
    conn = None
    try:
        if not dry_run:
            conn = connect_pg(args.database_url)
        upserted_wings, upserted_rooms = seed_wings_and_rooms(conn, dry_run=dry_run)
    except Exception as e:
        log.error("PostgreSQL seeding failed: %s", e)
        log.warning("Continuing with filesystem-only initialization (PostgreSQL unavailable)")
        upserted_wings, upserted_rooms = 0, 0
    finally:
        if conn is not None:
            conn.close()

    # ── 3. Create filesystem wing + room directories ───────────────────────
    created_wings = 0
    created_rooms = 0

    for wing_name, wing_info in WINGS.items():
        wing_path = palace_root / "wings" / wing_name
        wing_created = ensure_dir(wing_path, dry_run=dry_run)
        if wing_created:
            created_wings += 1
            write_readme(wing_path, wing_name, wing_info["description"], dry_run=dry_run)

        for room in wing_info["rooms"]:
            room_name = room["name"]

            # wings/<wing>/<room> directory
            room_path = wing_path / room_name
            room_created = ensure_dir(room_path, dry_run=dry_run)
            if room_created:
                created_rooms += 1
                write_readme(room_path, room_name, room["description"], dry_run=dry_run)

            # drawers/<wing>/<room> directory for verbatim files
            drawer_path = palace_root / "drawers" / wing_name / room_name
            ensure_dir(drawer_path, dry_run=dry_run)

    # ── 4. Knowledge graph ──────────────────────────────────────────────────
    # kg.json was removed in MP-IMPROVE-20260411-12 (dead file, nothing read it).
    # The live KG is in PostgreSQL tables kg_entities and kg_triples.

    # ── 5. Summary ─────────────────────────────────────────────────────────
    total_wings = len(WINGS)
    total_rooms = sum(len(w["rooms"]) for w in WINGS.values())

    if dry_run:
        log.info("[DRY-RUN] would create %d wings, %d rooms", total_wings, total_rooms)
    else:
        log.info(
            "done — %d wings (%d new dirs), %d rooms (%d new dirs), "
            "%d wings upserted in pg, %d rooms upserted in pg",
            total_wings,
            created_wings,
            total_rooms,
            created_rooms,
            upserted_wings,
            upserted_rooms,
        )
        # Print summary table
        print("\nPalace layout:")
        for wing_name, wing_info in WINGS.items():
            rooms = [r["name"] for r in wing_info["rooms"]]
            print(f"  {wing_name} ({len(rooms)} rooms):")
            for r in rooms:
                print(f"    - {r}")
        print(f"\nPalace path: {palace_root}")
        print(f"Total: {total_wings} wings, {total_rooms} rooms\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
