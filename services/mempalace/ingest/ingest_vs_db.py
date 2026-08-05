#!/usr/bin/env python3
"""Ingest VS DB entities into MemPalace as decisions.

Pulls initiatives, DONE tasks, task feedback, and project updates from
the VS PostgreSQL database and posts them to /ingest/decision.

Usage:
    python3 ingest_vs_db.py [--dry-run] [--limit N] [--since YYYY-MM-DD]
                            [--entity initiatives|tasks|feedback|updates|all]

State file: /opt/docker/mempalace/ingest-state/vs_db.json
    Stores last ingested createdAt per entity type — idempotent incremental sync.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip3 install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip3 install requests", file=sys.stderr)
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

INGEST_URL_BASE = "http://127.0.0.1:8031"
INGEST_DECISION_URL = f"{INGEST_URL_BASE}/ingest/decision"
STATE_FILE = Path("/opt/docker/mempalace/ingest-state/vs_db.json")
RATE_LIMIT_SLEEP = 0.3   # 300ms between requests (Ollama embed needs time)
REQUEST_TIMEOUT = 60     # seconds — Ollama embed per chunk
BATCH_SIZE = 50          # checkpoint after this many records

ENTITY_ALL = ("initiatives", "tasks", "feedback", "updates")

# ── Secrets ───────────────────────────────────────────────────────────────────

def _get_token() -> str:
    token = os.environ.get("MEMPALACE_TOKEN") or os.environ.get("MEMPALACE_BEARER_TOKEN")
    if token:
        return token
    secrets_path = Path("/opt/docker/secrets/.mempalace.env")
    if secrets_path.exists():
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("MEMPALACE_BEARER_TOKEN="):
                return line.split("=", 1)[1].strip()
            if line.startswith("MEMPALACE_INGEST_TOKEN="):
                return line.split("=", 1)[1].strip()
    print("ERROR: MEMPALACE_TOKEN not found. Set env var or ensure /opt/docker/secrets/.mempalace.env exists.", file=sys.stderr)
    sys.exit(1)


def _resolve_pg_host() -> str:
    """Resolve the pg container hostname for host-side connections.

    Priority (REV-20260419-0043):
    1. PG_HOST env var (explicit override — set by nightly.sh)
    2. 127.0.0.1:5432 if reachable (dev setups with pg port exposed)
    3. docker inspect pg (when running on host with docker group)
    4. Fallback to 'pg' (works if caller is inside docker_backend network)

    Previously the function returned "localhost" on both docker-inspect
    failure AND success-with-empty-stdout, silently breaking nightly cron
    when pg is not exposed on 127.0.0.1.
    """
    import os
    import socket
    import subprocess as _sp

    # 1. Explicit env var override
    env_host = os.environ.get("PG_HOST")
    if env_host:
        return env_host.strip()

    # 2. localhost:5432 reachable (pg port-forwarded to host)
    try:
        s = socket.create_connection(("127.0.0.1", 5432), timeout=2)
        s.close()
        return "localhost"
    except OSError:
        pass

    # 3. docker inspect (requires docker group membership)
    # Use absolute path; cron default PATH has /usr/bin but be explicit.
    from pathlib import Path as _P
    docker_bin = "/usr/bin/docker"
    if not _P(docker_bin).exists():
        docker_bin = "docker"
    try:
        result = _sp.run(
            [docker_bin, "inspect", "pg", "--format",
             "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            # Format yields space-separated IPs across networks; take first non-empty
            for ip in result.stdout.strip().split():
                ip = ip.strip()
                if ip:
                    return ip
    except Exception:
        pass

    # 4. In-network fallback — resolves only inside docker_backend
    return "pg"


def _get_db_url() -> str:
    """Return VS DB URL. Replaces Docker-internal 'pg' hostname with the
    reachable host (localhost or docker container IP)."""
    pg_host = _resolve_pg_host()

    def _fix_host(url: str) -> str:
        return url.replace("@pg:", f"@{pg_host}:")

    url = os.environ.get("VS_DATABASE_URL")
    if url:
        return _fix_host(url)
    secrets_path = Path("/opt/docker/secrets/.vs.env")
    if secrets_path.exists():
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return _fix_host(line.split("=", 1)[1].strip())
    return f"postgresql://vs:vs2026secure@{pg_host}:5432/vs"


# ── State file ────────────────────────────────────────────────────────────────

def _load_state() -> dict[str, Any]:
    """Load ingestion state. Structure: {entity: {"last_created_at": str, "count": int}}"""
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_state(state: dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ── DB helpers ────────────────────────────────────────────────────────────────

def _connect(db_url: str):
    """Connect to PostgreSQL using the DATABASE_URL string."""
    # Parse postgresql://user:pass@host:port/db
    import urllib.parse
    parsed = urllib.parse.urlparse(db_url)
    return psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        user=parsed.username,
        password=parsed.password,
        dbname=parsed.path.lstrip("/"),
    )


# ── POST helper ───────────────────────────────────────────────────────────────

def _post_decision(
    *,
    wing: str,
    room: str,
    timestamp: str,
    source: str,
    source_id: str,
    title: str,
    content: str,
    rationale: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    token: str,
    dry_run: bool,
) -> bool:
    """POST to /ingest/decision. Returns True on success."""
    if not content.strip():
        print(f"  [SKIP] empty content for source_id={source_id}")
        return False

    payload: dict[str, Any] = {
        "wing": wing,
        "room": room,
        "timestamp": timestamp,
        "source": source,
        "source_id": source_id,
        "title": title,
        "content": content,
        "metadata": metadata or {},
    }
    if rationale:
        payload["rationale"] = rationale

    if dry_run:
        print(f"  [DRY-RUN] {source} source_id={source_id} "
              f"title={title[:60]!r} content_len={len(content)}")
        return True

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        resp = requests.post(INGEST_DECISION_URL, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        print(f"  [ERROR] {source} source_id={source_id} network error: {e}")
        return False

    if resp.status_code == 202:
        print(f"  [OK] {source} source_id={source_id} title={title[:60]!r}")
        return True
    else:
        print(f"  [FAIL] {source} source_id={source_id} "
              f"status={resp.status_code} body={resp.text[:200]}")
        return False


def _ts(dt: Optional[datetime]) -> str:
    """Convert datetime to ISO-8601 string, fallback to now."""
    if dt is None:
        return datetime.now(timezone.utc).isoformat()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ── Per-domain room routing (MP-IMPROVE-20260411-09) ──────────────────────────
#
# Before this change every Task/Initiative was dumped into room_tasks, killing
# retrieval granularity. Now a simple keyword router maps work items to
# domain-specific rooms declared in init_palace.py WINGS["wing_vs"].
#
# Keywords are intentionally broad and case-insensitive. When in doubt, falls
# back to room_tasks so we never lose a record.
#
_ROOM_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("room_mempalace", (
        "mempalace", "palace", "chroma", "embedding", "embeddings",
        "pgvector", "retrieval", "rag", "reranker", "drawer", "ingester",
    )),
    ("room_security", (
        "security", "secret", "secrets", "auth", "authn", "authz",
        "xss", "csrf", "scrub", "scrubber", "infisical", "bearer",
        "token", "credential", "vulnerab",
    )),
    ("room_infra", (
        "infra", "docker", "compose", "nginx", "cloudflare", "backup",
        "restore", "dns", "tunnel", "systemd", "pg_dump", "watchtower",
        "registry", "vps", "nas", "deploy", "deployment",
    )),
    ("room_agents", (
        "agent", "agents", "subagent", "claude", "architect", "developer",
        "designer", "devsecops", "tester", "coo", "smm", "cat ",
    )),
]


def route_task_to_room(title: Optional[str], description: Optional[str]) -> str:
    """Route a Task/Initiative to the most specific wing_vs room.

    Priority order matches _ROOM_KEYWORDS. Falls back to room_tasks.
    """
    text = f"{title or ''} {description or ''}".lower()
    if not text.strip():
        return "room_tasks"
    for room, keywords in _ROOM_KEYWORDS:
        for kw in keywords:
            if kw in text:
                return room
    return "room_tasks"


# ── Initiative ingest ─────────────────────────────────────────────────────────

def ingest_initiatives(
    cur,
    *,
    token: str,
    dry_run: bool,
    limit: int,
    since: Optional[datetime],
    state: dict[str, Any],
) -> tuple[int, int, int]:
    """Returns (ingested, skipped, errors)."""
    entity = "initiatives"
    entity_state = state.get(entity, {})
    last_id = entity_state.get("last_id", "")

    # Fetch all (filter by last_id for idempotency via offset tracking)
    query = """
        SELECT id, title, "rawIdea", summary, status, priority, "projectId", "createdAt", "updatedAt"
        FROM "Initiative"
        ORDER BY "createdAt" ASC
    """
    if since:
        query = """
            SELECT id, title, "rawIdea", summary, status, priority, "projectId", "createdAt", "updatedAt"
            FROM "Initiative"
            WHERE "createdAt" >= %s
            ORDER BY "createdAt" ASC
        """
        cur.execute(query, (since,))
    else:
        cur.execute(query)

    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

    ingested = skipped = errors = 0
    ingested_ids: list[str] = []

    for row in rows:
        rec = dict(zip(cols, row))
        row_id = rec["id"]

        # Idempotency: skip already ingested
        ingested_set: list[str] = entity_state.get("ingested_ids", [])
        if row_id in ingested_set:
            skipped += 1
            continue

        # Build content from rawIdea + summary
        parts: list[str] = []
        if rec.get("rawIdea"):
            parts.append(f"## Idea\n{rec['rawIdea']}")
        if rec.get("summary"):
            parts.append(f"## Summary\n{rec['summary']}")
        content = "\n\n".join(parts)
        if not content.strip():
            content = rec.get("title", row_id)

        title = rec.get("title") or f"Initiative {row_id}"
        rationale = rec.get("summary") or None

        ok = _post_decision(
            wing="wing_vs",
            room="room_decisions",
            timestamp=_ts(rec.get("createdAt")),
            source="vs-initiatives",
            source_id=row_id,
            title=title,
            content=content,
            rationale=rationale,
            metadata={
                "status": rec.get("status", ""),
                "priority": rec.get("priority", 0),
                "projectId": rec.get("projectId") or "",
            },
            token=token,
            dry_run=dry_run,
        )

        if ok:
            ingested += 1
            ingested_ids.append(row_id)
            if not dry_run:
                # Checkpoint every BATCH_SIZE
                if ingested % BATCH_SIZE == 0:
                    entity_state.setdefault("ingested_ids", [])
                    entity_state["ingested_ids"].extend(ingested_ids)
                    ingested_ids = []
                    state[entity] = entity_state
                    _save_state(state)
            time.sleep(RATE_LIMIT_SLEEP)
        else:
            errors += 1

        if limit > 0 and ingested >= limit:
            break

    # Final save
    if not dry_run and ingested_ids:
        entity_state.setdefault("ingested_ids", [])
        entity_state["ingested_ids"].extend(ingested_ids)
        entity_state["last_synced"] = datetime.now(timezone.utc).isoformat()
        state[entity] = entity_state
        _save_state(state)

    return ingested, skipped, errors


# ── Task ingest (DONE only) ───────────────────────────────────────────────────

def ingest_tasks(
    cur,
    *,
    token: str,
    dry_run: bool,
    limit: int,
    since: Optional[datetime],
    state: dict[str, Any],
) -> tuple[int, int, int]:
    entity = "tasks"
    entity_state = state.get(entity, {})

    base_query = """
        SELECT id, "ticketId", title, description, status, "assigneeType",
               "initiativeId", "projectId", "commitHash", "commitUrl",
               "completionNote", "completedAt", "createdAt"
        FROM "Task"
        WHERE status = 'DONE'
        {since_clause}
        ORDER BY "completedAt" ASC NULLS LAST
    """
    if since:
        cur.execute(base_query.format(since_clause='AND "createdAt" >= %s'), (since,))
    else:
        cur.execute(base_query.format(since_clause=""))

    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

    ingested = skipped = errors = 0
    ingested_ids: list[str] = []

    # Content hash map: row_id -> hash of mutable fields.
    # When a task transitions (e.g. TODO->DONE) or gets a completionNote,
    # the hash changes and we re-ingest even if row_id was seen before.
    content_hashes: dict[str, str] = entity_state.get("content_hashes", {})

    for row in rows:
        rec = dict(zip(cols, row))
        row_id = rec["id"]

        # Compute hash of mutable fields to detect status updates
        hash_input = "|".join([
            str(rec.get("status", "")),
            str(rec.get("completionNote", "") or ""),
            str(rec.get("commitHash", "") or ""),
            str(rec.get("commitUrl", "") or ""),
        ])
        row_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:16]

        ingested_set: list[str] = entity_state.get("ingested_ids", [])
        if row_id in ingested_set and content_hashes.get(row_id) == row_hash:
            skipped += 1
            continue

        # Build content
        parts: list[str] = []
        if rec.get("description"):
            parts.append(f"## Description\n{rec['description']}")
        if rec.get("completionNote"):
            parts.append(f"## Completion Note\n{rec['completionNote']}")
        if rec.get("commitUrl"):
            parts.append(f"## Commit\n{rec['commitUrl']}")
        elif rec.get("commitHash"):
            parts.append(f"## Commit Hash\n{rec['commitHash']}")
        content = "\n\n".join(parts)
        if not content.strip():
            content = rec.get("title", row_id)

        title = rec.get("title") or f"Task {row_id}"
        timestamp = _ts(rec.get("completedAt") or rec.get("createdAt"))
        room = route_task_to_room(title, rec.get("description"))

        ok = _post_decision(
            wing="wing_vs",
            room=room,
            timestamp=timestamp,
            source="vs-tasks",
            source_id=row_id,
            title=title,
            content=content,
            metadata={
                "status": rec.get("status", "DONE"),
                "ticketId": rec.get("ticketId", ""),
                "initiativeId": rec.get("initiativeId", ""),
                "assigneeType": rec.get("assigneeType", ""),
                "commitHash": rec.get("commitHash") or "",
                "routed_room": room,
            },
            token=token,
            dry_run=dry_run,
        )

        if ok:
            ingested += 1
            ingested_ids.append(row_id)
            content_hashes[row_id] = row_hash
            if not dry_run and ingested % BATCH_SIZE == 0:
                entity_state.setdefault("ingested_ids", [])
                entity_state["ingested_ids"].extend(ingested_ids)
                entity_state["content_hashes"] = content_hashes
                ingested_ids = []
                state[entity] = entity_state
                _save_state(state)
            time.sleep(RATE_LIMIT_SLEEP)
        else:
            errors += 1

        if limit > 0 and ingested >= limit:
            break

    if not dry_run and ingested_ids:
        entity_state.setdefault("ingested_ids", [])
        entity_state["ingested_ids"].extend(ingested_ids)
        entity_state["content_hashes"] = content_hashes
        entity_state["last_synced"] = datetime.now(timezone.utc).isoformat()
        state[entity] = entity_state
        _save_state(state)

    return ingested, skipped, errors


# ── TaskFeedback ingest ────────────────────────────────────────────────────────

def ingest_feedback(
    cur,
    *,
    token: str,
    dry_run: bool,
    limit: int,
    since: Optional[datetime],
    state: dict[str, Any],
) -> tuple[int, int, int]:
    entity = "feedback"
    entity_state = state.get(entity, {})

    base_query = """
        SELECT f.id, f."taskId", f.comment, f.approved, f."createdAt",
               t.title as task_title
        FROM "TaskFeedback" f
        LEFT JOIN "Task" t ON t.id = f."taskId"
        {since_clause}
        ORDER BY f."createdAt" ASC
    """
    if since:
        cur.execute(base_query.format(since_clause='WHERE f."createdAt" >= %s'), (since,))
    else:
        cur.execute(base_query.format(since_clause=""))

    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

    # Verification: if TaskFeedback is empty we should see it in the logs,
    # not silently return (0,0,0). MP-IMPROVE-20260411-09: this caught the
    # fact that the table has simply never been populated — no SQL bug.
    # Also guards against future regressions where SELECT returns rows but
    # the ingester fails to emit them (mismatched column names, etc.).
    total_rows = len(rows)
    already_seen = set(entity_state.get("ingested_ids", []))
    candidate_rows = sum(1 for row in rows
                         if dict(zip(cols, row))["id"] not in already_seen)
    print(f"  feedback: fetched {total_rows} rows from TaskFeedback "
          f"(new candidates: {candidate_rows}, already seen: {total_rows - candidate_rows})")

    ingested = skipped = errors = 0
    ingested_ids: list[str] = []

    for row in rows:
        rec = dict(zip(cols, row))
        row_id = rec["id"]

        ingested_set: list[str] = entity_state.get("ingested_ids", [])
        if row_id in ingested_set:
            skipped += 1
            continue

        task_title = rec.get("task_title") or rec.get("taskId", "unknown task")
        title = f"Feedback on {task_title}"
        content = rec.get("comment", "")
        if not content.strip():
            skipped += 1
            continue

        ok = _post_decision(
            wing="wing_workflow",
            room="room_feedback",
            timestamp=_ts(rec.get("createdAt")),
            source="vs-feedback",
            source_id=row_id,
            title=title,
            content=content,
            metadata={
                "taskId": rec.get("taskId", ""),
                "approved": rec.get("approved", False),
            },
            token=token,
            dry_run=dry_run,
        )

        if ok:
            ingested += 1
            ingested_ids.append(row_id)
            if not dry_run and ingested % BATCH_SIZE == 0:
                entity_state.setdefault("ingested_ids", [])
                entity_state["ingested_ids"].extend(ingested_ids)
                ingested_ids = []
                state[entity] = entity_state
                _save_state(state)
            time.sleep(RATE_LIMIT_SLEEP)
        else:
            errors += 1

        if limit > 0 and ingested >= limit:
            break

    if not dry_run and ingested_ids:
        entity_state.setdefault("ingested_ids", [])
        entity_state["ingested_ids"].extend(ingested_ids)
        entity_state["last_synced"] = datetime.now(timezone.utc).isoformat()
        state[entity] = entity_state
        _save_state(state)

    # Silent-miss guard (MP-IMPROVE-20260411-09): if we saw rows but emitted
    # nothing (and nothing was legitimately skipped as empty), something is
    # wrong — wrong column, stale state, DB permission mishap, etc.
    if candidate_rows > 0 and ingested == 0 and errors == 0 and skipped == 0:
        raise RuntimeError(
            f"feedback: {candidate_rows} new rows in TaskFeedback but "
            f"ingester emitted none — check column names / query / server health"
        )

    return ingested, skipped, errors


# ── ProjectUpdate ingest ───────────────────────────────────────────────────────

def ingest_updates(
    cur,
    *,
    token: str,
    dry_run: bool,
    limit: int,
    since: Optional[datetime],
    state: dict[str, Any],
) -> tuple[int, int, int]:
    entity = "updates"
    entity_state = state.get(entity, {})

    base_query = """
        SELECT id, title, description, type, "projectId", "createdAt"
        FROM "ProjectUpdate"
        {since_clause}
        ORDER BY "createdAt" ASC
    """
    if since:
        cur.execute(base_query.format(since_clause='WHERE "createdAt" >= %s'), (since,))
    else:
        cur.execute(base_query.format(since_clause=""))

    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]

    ingested = skipped = errors = 0
    ingested_ids: list[str] = []

    for row in rows:
        rec = dict(zip(cols, row))
        row_id = rec["id"]

        ingested_set: list[str] = entity_state.get("ingested_ids", [])
        if row_id in ingested_set:
            skipped += 1
            continue

        title = rec.get("title") or f"Update {row_id}"
        content = rec.get("description", "")
        if not content.strip():
            content = title

        ok = _post_decision(
            wing="wing_vs",
            room="room_decisions",
            timestamp=_ts(rec.get("createdAt")),
            source="vs-updates",
            source_id=row_id,
            title=title,
            content=content,
            metadata={
                "type": rec.get("type", ""),
                "projectId": rec.get("projectId", ""),
            },
            token=token,
            dry_run=dry_run,
        )

        if ok:
            ingested += 1
            ingested_ids.append(row_id)
            if not dry_run and ingested % BATCH_SIZE == 0:
                entity_state.setdefault("ingested_ids", [])
                entity_state["ingested_ids"].extend(ingested_ids)
                ingested_ids = []
                state[entity] = entity_state
                _save_state(state)
            time.sleep(RATE_LIMIT_SLEEP)
        else:
            errors += 1

        if limit > 0 and ingested >= limit:
            break

    if not dry_run and ingested_ids:
        entity_state.setdefault("ingested_ids", [])
        entity_state["ingested_ids"].extend(ingested_ids)
        entity_state["last_synced"] = datetime.now(timezone.utc).isoformat()
        state[entity] = entity_state
        _save_state(state)

    return ingested, skipped, errors


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest VS DB (initiatives, tasks, feedback, updates) into MemPalace"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be ingested without POSTing")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max records per entity (0 = unlimited)")
    parser.add_argument("--since", type=str, default="",
                        help="Only ingest records newer than YYYY-MM-DD")
    parser.add_argument("--entity", type=str, default="all",
                        choices=list(ENTITY_ALL) + ["all"],
                        help="Entity type to ingest (default: all)")
    parser.add_argument("--rebuild", action="store_true",
                        help="Ignore state file and re-consider every record (MP-ARCH-FUTURE-06). "
                             "Insert dedup via source_id still prevents duplicates.")
    args = parser.parse_args()

    # Parse --since
    since_dt: Optional[datetime] = None
    if args.since:
        try:
            since_dt = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            print(f"ERROR: --since must be YYYY-MM-DD, got: {args.since}", file=sys.stderr)
            sys.exit(1)

    # Token (skip for dry-run)
    token = ""
    if not args.dry_run:
        token = _get_token()

    # DB connection
    db_url = _get_db_url()
    print(f"Connecting to VS DB: {db_url.split('@')[-1]}")  # log host/db only, not credentials
    try:
        conn = _connect(db_url)
        conn.set_session(readonly=True, autocommit=True)
        cur = conn.cursor()
    except Exception as e:
        print(f"ERROR: Cannot connect to DB: {e}", file=sys.stderr)
        sys.exit(1)

    # Load state (ignored under --rebuild per MP-ARCH-FUTURE-06)
    if args.rebuild:
        print("[rebuild] --rebuild flag set → ignoring state file, re-considering all records")
        state = {}
    else:
        state = _load_state()

    entities = list(ENTITY_ALL) if args.entity == "all" else [args.entity]

    total_ingested = 0
    total_skipped = 0
    total_errors = 0
    per_entity: dict[str, dict[str, int]] = {}

    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'} | "
          f"Entities: {entities} | Limit: {args.limit or 'unlimited'} | "
          f"Since: {args.since or 'all'}")

    for entity in entities:
        print(f"\n--- Ingesting: {entity} ---")
        dispatch = {
            "initiatives": ingest_initiatives,
            "tasks": ingest_tasks,
            "feedback": ingest_feedback,
            "updates": ingest_updates,
        }
        fn = dispatch[entity]
        ing, skp, err = fn(
            cur,
            token=token,
            dry_run=args.dry_run,
            limit=args.limit,
            since=since_dt,
            state=state,
        )
        per_entity[entity] = {"ingested": ing, "skipped": skp, "errors": err}
        total_ingested += ing
        total_skipped += skp
        total_errors += err
        print(f"  {entity}: ingested={ing} skipped={skp} errors={err}")

    cur.close()
    conn.close()

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"\n[{mode}] Total: ingested={total_ingested} skipped={total_skipped} errors={total_errors}")
    print("Per entity:")
    for ent, counts in per_entity.items():
        print(f"  {ent}: {counts}")


if __name__ == "__main__":
    main()
