#!/usr/bin/env python3
"""Shuleansky ingester — mp_t08.

Reads sessions, transcripts, and materials from the `sh` PostgreSQL database
and ingests them into MemPalace.

Sources:
  - transcripts (sh.transcripts + sh.sessions) → POST /ingest/transcript
    wing=wing_shuleansky, room=room_transcripts
    Large transcripts (>10000 chars) are chunked automatically.

  - materials (sh.materials, type=document) → POST /ingest/decision
    wing=wing_shuleansky, room=room_scripts or room_topics

  - participants (sh.participants) → POST /ingest/decision
    wing=wing_shuleansky, room=room_guests

Usage:
    python3 ingest_shuleansky.py [--dry-run] [--limit N] [--since YYYY-MM-DD]

State file: /opt/docker/mempalace/ingest-state/shuleansky.json
    {
      "transcripts": {"<session_id>": {"sha256": "...", "ingested_at": ..., "chunks": N}},
      "materials":   {"<material_id>": {"sha256": "...", "ingested_at": ...}},
      "participants":{"<participant_id>": {"sha256": "...", "ingested_at": ...}}
    }

Idempotency (REV-20260512-010): composite key `(source_id, content_sha256)`.
  - If record's source_id is unseen → ingest (new).
  - If source_id known but sha256 differs from last seen → re-ingest (content
    changed). Sidecar /ingest endpoints overwrite drawer by source_id, so a
    fresh POST replaces the stale row.
  - If source_id known and sha256 matches → skip (true duplicate).

Stale-source alert: if `sh.example.com` has rows newer than 7d but everything
was deduped, emit a WARN via the sidecar Telegram channel so silent stagnation
is surfaced.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip3 install requests", file=sys.stderr)
    sys.exit(1)

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip3 install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

INGEST_TRANSCRIPT_URL = "http://127.0.0.1:8031/ingest/transcript"
INGEST_DECISION_URL   = "http://127.0.0.1:8031/ingest/decision"
STATE_FILE            = Path("/opt/docker/mempalace/ingest-state/shuleansky.json")
RATE_LIMIT_SEC        = 0.2   # 200ms between requests (transcripts can be large)
CHUNK_MAX_CHARS       = 10_000  # chunk transcripts longer than this
# Incremental batching: limit new transcripts per run so single nightly run
# stays within timeout. Tunable via env var. 0 = unlimited.
MAX_SESSIONS_PER_RUN  = int(os.environ.get("SHULEANSKY_MAX_SESSIONS_PER_RUN", "5"))

WING      = "wing_shuleansky"
SOURCE    = "shuleansky"

# Database — connect via TCP to shared pg container


def _resolve_pg_host() -> str:
    """Resolve the pg container hostname for host-side connections.

    Priority (REV-20260419-0044, mirrors ingest_vs_db.py REV-0043):
    1. SH_DB_HOST env var (legacy explicit override)
    2. PG_HOST env var (exported by nightly.sh)
    3. 127.0.0.1:5432 if reachable (dev setups with pg port exposed)
    4. docker inspect pg (when running on host with docker group)
    5. Fallback to pg (works if caller is inside docker_backend network)
    """
    import socket
    import subprocess as _sp
    from pathlib import Path as _P

    env_host = os.environ.get("SH_DB_HOST") or os.environ.get("PG_HOST")
    if env_host:
        return env_host.strip()

    try:
        s = socket.create_connection(("127.0.0.1", 5432), timeout=2)
        s.close()
        return "127.0.0.1"
    except OSError:
        pass

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
            for ip in result.stdout.strip().split():
                ip = ip.strip()
                if ip:
                    return ip
    except Exception:
        pass

    return "pg"


def _is_mini_host() -> bool:
    """Detect whether we are running on VPS (prod) vs Mac (dev).

    On VPS, sh DB MUST be available — connection failure is an error.
    On Mac/elsewhere, sh DB may be absent — graceful exit 0 is fine.
    """
    # Robust detection: /opt/docker is the VPS compose root (see CLAUDE.md
    # Infrastructure section). Mac uses ~/vibe-studio.
    # Also accept an explicit override via MEMPALACE_IS_MINI=1.
    if os.environ.get("MEMPALACE_IS_MINI") == "1":
        return True
    try:
        return Path("/opt/docker").is_dir()
    except Exception:
        return False


DB_HOST = _resolve_pg_host()
DB_PORT = int(os.environ.get("SH_DB_PORT", "5432"))
DB_NAME = os.environ.get("SH_DB_NAME", "sh")
DB_USER = os.environ.get("SH_DB_USER", "sh")
DB_PASS = os.environ.get("SH_DB_PASS", "sh")


# ── Token ─────────────────────────────────────────────────────────────────────

def _get_token() -> str:
    """Read MEMPALACE_BEARER_TOKEN from env or .mempalace.env secrets file."""
    token = os.environ.get("MEMPALACE_BEARER_TOKEN") or os.environ.get("MEMPALACE_INGEST_TOKEN")
    if token:
        return token.strip()
    # Fallback: read via sudo cat
    try:
        result = subprocess.run(
            ["sudo", "cat", "/opt/docker/secrets/.mempalace.env"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if line.startswith("MEMPALACE_BEARER_TOKEN="):
                    return line.split("=", 1)[1].strip()
                if line.startswith("MEMPALACE_INGEST_TOKEN="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    # Fallback: direct file read
    secrets_path = Path("/opt/docker/secrets/.mempalace.env")
    if secrets_path.exists():
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("MEMPALACE_BEARER_TOKEN="):
                return line.split("=", 1)[1].strip()
            if line.startswith("MEMPALACE_INGEST_TOKEN="):
                return line.split("=", 1)[1].strip()
    print("ERROR: MEMPALACE_BEARER_TOKEN not found in env or /opt/docker/secrets/.mempalace.env", file=sys.stderr)
    sys.exit(1)


# ── State ─────────────────────────────────────────────────────────────────────

def _load_state() -> dict[str, Any]:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_state(state: dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False))


# ── Dedup helpers (REV-20260512-010) ──────────────────────────────────────────

def _sha256(text: str) -> str:
    """Return hex-encoded SHA-256 of UTF-8 encoded text."""
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def _is_duplicate(stream_state: dict[str, Any], source_id: str, sha: str) -> tuple[bool, str]:
    """Return (is_dup, reason) for composite (source_id, sha256) dedup.

    reason ∈ {"new", "changed", "duplicate"}.
    """
    entry = stream_state.get(source_id)
    if entry is None:
        return False, "new"
    prev_sha = entry.get("sha256") if isinstance(entry, dict) else None
    if prev_sha == sha:
        return True, "duplicate"
    # source_id known but content changed → re-ingest
    return False, "changed"


# ── DB connection ─────────────────────────────────────────────────────────────

def _connect() -> "psycopg2.connection":
    """Connect to the sh database. Raises if unavailable."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        connect_timeout=10,
    )


# ── Chunking ──────────────────────────────────────────────────────────────────

def _chunk_text(text: str, max_chars: int = CHUNK_MAX_CHARS) -> list[str]:
    """Split text into chunks of at most max_chars, preferring paragraph breaks."""
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    paragraphs = text.split("\n\n")
    current = ""

    for para in paragraphs:
        # If single paragraph exceeds limit, hard-split by sentence boundary
        if len(para) > max_chars:
            sentences = para.replace(". ", ".\n").split("\n")
            for sent in sentences:
                if len(current) + len(sent) + 2 > max_chars and current:
                    chunks.append(current.strip())
                    current = sent
                else:
                    current = (current + " " + sent).strip() if current else sent
        elif len(current) + len(para) + 2 > max_chars and current:
            chunks.append(current.strip())
            current = para
        else:
            current = (current + "\n\n" + para).strip() if current else para

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text[:max_chars]]


# ── HTTP helpers ──────────────────────────────────────────────────────────────

# REV-20260520-shuleansky-ingest: Sidecar may be restarted by Status auto-heal
# while embeddings block /health (single uvicorn worker on Ollama nomic-embed
# call). We retry POSTs on ConnectionError/ReadTimeout up to MAX_POST_RETRIES
# with a short backoff, waiting for /health to come back between attempts.
MAX_POST_RETRIES = 4
POST_BACKOFF_SEC = 5.0  # base delay; total wait per chunk ≤ ~75s
HEALTH_URL       = "http://127.0.0.1:8031/health"


def _wait_for_sidecar(timeout_sec: float = 30.0) -> bool:
    """Poll /health until 200 or timeout. Returns True if healthy."""
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        try:
            r = requests.get(HEALTH_URL, timeout=3)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(1.0)
    return False


def _post_with_retry(url: str, payload: dict[str, Any], token: str, *, label: str) -> "Optional[Any]":
    """POST helper that survives sidecar restarts. Returns Response on success,
    None on permanent failure. Logs each retry."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    last_err: Optional[str] = None
    for attempt in range(1, MAX_POST_RETRIES + 1):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=60)
            return resp
        except (requests.exceptions.ConnectionError,
                requests.exceptions.ReadTimeout,
                requests.exceptions.ChunkedEncodingError) as e:
            last_err = f"{type(e).__name__}: {str(e)[:160]}"
            if attempt >= MAX_POST_RETRIES:
                break
            delay = POST_BACKOFF_SEC * attempt
            print(f"  [retry] {label} attempt {attempt}/{MAX_POST_RETRIES} hit {type(e).__name__} — "
                  f"waiting for sidecar (sleep {delay:.0f}s)", flush=True)
            time.sleep(delay)
            _wait_for_sidecar(timeout_sec=30.0)
    print(f"  [FAIL] {label} — exhausted {MAX_POST_RETRIES} attempts: {last_err}", flush=True)
    return None


def _post_transcript(
    *,
    wing: str,
    room: str,
    timestamp: str,
    source_id: str,
    content: str,
    speakers: list[str],
    metadata: dict[str, Any],
    token: str,
    dry_run: bool,
    label: str,
) -> bool:
    """POST to /ingest/transcript. Returns True on success."""
    payload = {
        "wing": wing,
        "room": room,
        "timestamp": timestamp,
        "source": SOURCE,
        "source_id": source_id,
        "content": content,
        "speakers": speakers,
        "metadata": metadata,
    }
    if dry_run:
        print(f"  [DRY-RUN] transcript {label} → {wing}/{room} "
              f"speakers={speakers} bytes={len(content)}")
        return True
    resp = _post_with_retry(INGEST_TRANSCRIPT_URL, payload, token, label=f"transcript {label}")
    if resp is None:
        return False
    if resp.status_code == 202:
        print(f"  [OK] transcript {label} → {wing}/{room} bytes={len(content)}")
        return True
    print(f"  [FAIL] transcript {label} status={resp.status_code} body={resp.text[:200]}")
    return False


def _post_decision(
    *,
    wing: str,
    room: str,
    timestamp: str,
    title: str,
    content: str,
    rationale: Optional[str],
    metadata: dict[str, Any],
    token: str,
    dry_run: bool,
    label: str,
) -> bool:
    """POST to /ingest/decision. Returns True on success."""
    payload = {
        "wing": wing,
        "room": room,
        "timestamp": timestamp,
        "source": SOURCE,
        "title": title,
        "content": content,
        "metadata": metadata,
    }
    if rationale:
        payload["rationale"] = rationale
    if dry_run:
        print(f"  [DRY-RUN] decision {label} → {wing}/{room} title={title!r} bytes={len(content)}")
        return True
    resp = _post_with_retry(INGEST_DECISION_URL, payload, token, label=f"decision {label}")
    if resp is None:
        return False
    if resp.status_code == 202:
        print(f"  [OK] decision {label} → {wing}/{room} title={title!r}")
        return True
    print(f"  [FAIL] decision {label} status={resp.status_code} body={resp.text[:200]}")
    return False


# ── Ingest: Transcripts ───────────────────────────────────────────────────────

def ingest_transcripts(
    conn: "psycopg2.connection",
    *,
    state: dict[str, Any],
    token: str,
    dry_run: bool,
    limit: int,
    since_dt: Optional[datetime],
) -> tuple[int, int, int]:
    """Ingest transcripts + session metadata. Returns (ingested, skipped, errors).

    REV-20260512-010: dedup by composite (source_id, content_sha256). If a
    session's transcript content changed (e.g. re-diarized, edited), the
    sha256 differs from stored state and the drawer is re-ingested.
    """
    ingested = skipped = errors = reingested = 0
    tr_state: dict[str, Any] = state.setdefault("transcripts", {})

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                t.id          AS transcript_id,
                t.session_id,
                t.full_text,
                t.language,
                t.created_at  AS transcript_created_at,
                s.session_number,
                s.title       AS session_title,
                s.description AS session_description,
                s.date        AS session_date,
                s.duration_min
            FROM transcripts t
            JOIN sessions s ON s.id = t.session_id
            ORDER BY s.session_number ASC
        """)
        rows = cur.fetchall()

    print(f"\nTranscripts: {len(rows)} total (max_per_run={MAX_SESSIONS_PER_RUN or 'unlimited'})", flush=True)

    # Fetch speakers (participants) for context
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, name FROM participants ORDER BY id")
        all_participants = [r["name"] for r in cur.fetchall()]

    processed_count = 0
    for row in rows:
        if limit > 0 and ingested >= limit:
            break
        if MAX_SESSIONS_PER_RUN > 0 and ingested >= MAX_SESSIONS_PER_RUN:
            print(f"  [batch-limit] reached MAX_SESSIONS_PER_RUN={MAX_SESSIONS_PER_RUN}, stopping transcripts ingestion", flush=True)
            break

        sid = str(row["session_id"])

        session_date: datetime = row["session_date"]
        if since_dt and session_date:
            session_date_aware = session_date.replace(tzinfo=timezone.utc) if session_date.tzinfo is None else session_date
            if session_date_aware < since_dt:
                skipped += 1  # skipped:filtered — content too old
                continue

        full_text: str = row["full_text"] or ""
        if not full_text.strip():
            print(f"  [SKIP] session_id={sid} — empty transcript")
            skipped += 1
            continue

        # REV-20260512-010: composite dedup by (source_id, content_sha256).
        # sha256 covers full_text + session_title + session_description so
        # renames or description edits also trigger re-ingest.
        dedup_input = (
            f"{row['session_number']}|{row['session_title'] or ''}|"
            f"{row['session_description'] or ''}|{row['language'] or ''}|"
            f"{row['duration_min'] or 0}|{full_text}"
        )
        sha = _sha256(dedup_input)
        is_dup, reason = _is_duplicate(tr_state, sid, sha)
        if is_dup:
            skipped += 1  # skipped:dedup — same content sha as last run
            continue
        if reason == "changed":
            print(f"  [re-ingest] session_id={sid} — content changed, sha={sha[:12]}", flush=True)
            reingested += 1

        processed_count += 1
        if processed_count % 5 == 1:
            print(f"  [progress] processing session {processed_count} (session_id={sid}, session_number={row['session_number']}, reason={reason})", flush=True)

        # Build header
        session_header = (
            f"# Shuleansky — Сесія {row['session_number']}: {row['session_title']}\n\n"
        )
        if row["session_description"]:
            session_header += f"**Опис:** {row['session_description']}\n\n"
        session_header += (
            f"**Дата:** {session_date.strftime('%Y-%m-%d') if session_date else 'невідомо'}\n"
            f"**Тривалість:** {row['duration_min']} хв\n"
            f"**Мова:** {row['language']}\n\n"
            "---\n\n"
        )

        ts_iso = (
            session_date.isoformat() if session_date else
            row["transcript_created_at"].isoformat()
        )

        chunks = _chunk_text(full_text)
        chunk_errors = 0
        total_chunks = len(chunks)
        if total_chunks > 5:
            print(f"  [chunks] session_id={sid} has {total_chunks} chunks ({len(full_text)} chars)", flush=True)

        # REV-20260520-shuleansky-ingest: resume from last successful chunk if
        # this session was partially ingested in a previous failed attempt and
        # the sha256 still matches (i.e. content hasn't changed since).
        prev_entry = tr_state.get(sid) if isinstance(tr_state.get(sid), dict) else None
        resume_from = 0
        if (prev_entry
                and prev_entry.get("sha256") == sha
                and prev_entry.get("partial")
                and isinstance(prev_entry.get("last_chunk_idx"), int)
                and prev_entry.get("total_chunks") == total_chunks):
            resume_from = prev_entry["last_chunk_idx"] + 1
            if resume_from >= total_chunks:
                resume_from = 0  # safety: nothing left to do, full re-run
            else:
                print(f"  [resume] session_id={sid} resuming from chunk {resume_from + 1}/{total_chunks} "
                      f"(prior partial ingest, same sha)", flush=True)

        for i, chunk in enumerate(chunks):
            if i < resume_from:
                continue
            if total_chunks > 5 and i > 0 and i % 5 == 0:
                print(f"    [chunk-progress] {i}/{total_chunks} chunks uploaded for session_id={sid}", flush=True)
            chunk_content = session_header + chunk if i == 0 else chunk
            chunk_source_id = f"session_{sid}" if len(chunks) == 1 else f"session_{sid}_chunk_{i+1}of{len(chunks)}"
            chunk_label = f"session_{sid}" if len(chunks) == 1 else f"session_{sid}[{i+1}/{len(chunks)}]"
            metadata: dict[str, Any] = {
                "session_id": int(sid),
                "session_number": row["session_number"],
                "session_title": row["session_title"],
                "language": row["language"],
                "duration_min": row["duration_min"],
                "chunk_index": i,
                "total_chunks": len(chunks),
                "transcript_id": row["transcript_id"],
            }

            ok = _post_transcript(
                wing=WING,
                room="room_transcripts",
                timestamp=ts_iso,
                source_id=chunk_source_id,
                content=chunk_content,
                speakers=all_participants[:5],  # top participants as speakers
                metadata=metadata,
                token=token,
                dry_run=dry_run,
                label=chunk_label,
            )

            if not ok:
                chunk_errors += 1
                # REV-20260520-shuleansky-ingest: persist partial progress so
                # the next attempt can resume from i instead of restarting at
                # chunk 0 (which was causing repeated death at sidecar restart).
                if not dry_run and i > 0:
                    tr_state[sid] = {
                        "sha256": sha,
                        "ingested_at": datetime.now(timezone.utc).isoformat(),
                        "session_number": row["session_number"],
                        "session_title": row["session_title"],
                        "chunks": total_chunks,
                        "partial": True,
                        "last_chunk_idx": i - 1,  # last fully-ack'd chunk
                        "total_chunks": total_chunks,
                    }
                    _save_state(state)
                break  # stop this session; remaining chunks become next-run work
            # Checkpoint after each successful chunk for large sessions so the
            # next attempt resumes near the failure point.
            if not dry_run and total_chunks > 5 and (i + 1) < total_chunks:
                tr_state[sid] = {
                    "sha256": sha,
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                    "session_number": row["session_number"],
                    "session_title": row["session_title"],
                    "chunks": total_chunks,
                    "partial": True,
                    "last_chunk_idx": i,
                    "total_chunks": total_chunks,
                }
                _save_state(state)
            time.sleep(RATE_LIMIT_SEC)

        if chunk_errors == 0:
            ingested += 1
            if not dry_run:
                tr_state[sid] = {
                    "sha256": sha,
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                    "session_number": row["session_number"],
                    "session_title": row["session_title"],
                    "chunks": len(chunks),
                }
        else:
            errors += 1

    if reingested > 0:
        print(f"  [info] {reingested} transcript(s) re-ingested due to content change")
    return ingested, skipped, errors


# ── Ingest: Materials ─────────────────────────────────────────────────────────

def ingest_materials(
    conn: "psycopg2.connection",
    *,
    state: dict[str, Any],
    token: str,
    dry_run: bool,
    limit: int,
    since_dt: Optional[datetime],
) -> tuple[int, int, int]:
    """Ingest document materials (scripts, notes, glossaries, homework).
    Returns (ingested, skipped, errors).

    REV-20260512-010: composite dedup by (material_id, content_sha256).
    """
    ingested = skipped = errors = reingested = 0
    mat_state: dict[str, Any] = state.setdefault("materials", {})

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                m.id,
                m.session_id,
                m.title,
                m.type,
                m.content,
                m.sort_order,
                m.created_at,
                s.session_number,
                s.title AS session_title,
                s.date  AS session_date
            FROM materials m
            JOIN sessions s ON s.id = m.session_id
            WHERE m.type = 'document'
              AND m.content IS NOT NULL
              AND length(m.content) > 0
            ORDER BY s.session_number ASC, m.sort_order ASC
        """)
        rows = cur.fetchall()

    print(f"\nMaterials (document): {len(rows)} total")

    for row in rows:
        if limit > 0 and ingested >= limit:
            break

        mid = str(row["id"])

        session_date: datetime = row["session_date"]
        if since_dt and session_date:
            session_date_aware = session_date.replace(tzinfo=timezone.utc) if session_date.tzinfo is None else session_date
            if session_date_aware < since_dt:
                skipped += 1
                continue

        content: str = row["content"] or ""
        if not content.strip():
            skipped += 1
            continue

        # REV-20260512-010: composite dedup. Hash title + type + sort_order + content
        # so renames and reordering also re-ingest.
        dedup_input = (
            f"{row['title'] or ''}|{row['type'] or ''}|{row['sort_order'] or 0}|{content}"
        )
        sha = _sha256(dedup_input)
        is_dup, reason = _is_duplicate(mat_state, mid, sha)
        if is_dup:
            skipped += 1
            continue
        if reason == "changed":
            print(f"  [re-ingest] material_id={mid} — content changed, sha={sha[:12]}")
            reingested += 1

        ts_iso = (
            session_date.isoformat() if session_date else
            row["created_at"].isoformat()
        )

        # Choose room by title keywords
        title_lower = row["title"].lower()
        if any(k in title_lower for k in ("структура", "сценарий", "script", "outline")):
            room = "room_scripts"
        elif any(k in title_lower for k in ("тема", "topic", "глоссарий", "glossary")):
            room = "room_topics"
        else:
            room = "room_scripts"  # default for lecture materials

        full_title = f"Сесія {row['session_number']}: {row['title']}"
        rationale = f"Навчальний матеріал до сесії «{row['session_title']}» (Shuleansky, {session_date.strftime('%Y-%m-%d') if session_date else 'N/A'})"

        metadata: dict[str, Any] = {
            "material_id": row["id"],
            "session_id": row["session_id"],
            "session_number": row["session_number"],
            "session_title": row["session_title"],
            "material_type": row["type"],
            "sort_order": row["sort_order"],
        }

        ok = _post_decision(
            wing=WING,
            room=room,
            timestamp=ts_iso,
            title=full_title,
            content=content,
            rationale=rationale,
            metadata=metadata,
            token=token,
            dry_run=dry_run,
            label=f"material_{mid}",
        )

        if ok:
            ingested += 1
            if not dry_run:
                mat_state[mid] = {
                    "sha256": sha,
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                    "title": full_title,
                    "room": room,
                }
        else:
            errors += 1

        time.sleep(RATE_LIMIT_SEC)

    if reingested > 0:
        print(f"  [info] {reingested} material(s) re-ingested due to content change")
    return ingested, skipped, errors


# ── Ingest: Participants ──────────────────────────────────────────────────────

def ingest_participants(
    conn: "psycopg2.connection",
    *,
    state: dict[str, Any],
    token: str,
    dry_run: bool,
    limit: int,
) -> tuple[int, int, int]:
    """Ingest participants (guests) as decision records.
    Returns (ingested, skipped, errors).

    REV-20260512-010: composite dedup by (participant_id, content_sha256).
    """
    ingested = skipped = errors = reingested = 0
    par_state: dict[str, Any] = state.setdefault("participants", {})

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT
                p.id, p.name, p.email, p.phone, p.notes, p.telegram,
                p.created_at,
                COUNT(cp.course_id) AS course_count
            FROM participants p
            LEFT JOIN course_participants cp ON cp.participant_id = p.id
            GROUP BY p.id
            ORDER BY p.id
        """)
        rows = cur.fetchall()

    print(f"\nParticipants: {len(rows)} total")

    for row in rows:
        if limit > 0 and ingested >= limit:
            break

        pid = str(row["id"])

        name: str = row["name"] or "Unknown"
        ts_iso = row["created_at"].isoformat() if row["created_at"] else datetime.now(timezone.utc).isoformat()

        # Build content — include only non-sensitive info (no email/phone/telegram)
        lines = [f"**Ім'я:** {name}"]
        if row["course_count"]:
            lines.append(f"**Курсів:** {row['course_count']}")
        if row["notes"]:
            lines.append(f"**Нотатки:** {row['notes']}")

        content = "\n".join(lines)

        # REV-20260512-010: composite dedup. Hash name + notes + course_count
        # so any meaningful profile change re-ingests the drawer.
        dedup_input = f"{name}|{row['notes'] or ''}|{int(row['course_count'] or 0)}"
        sha = _sha256(dedup_input)
        is_dup, reason = _is_duplicate(par_state, pid, sha)
        if is_dup:
            skipped += 1
            continue
        if reason == "changed":
            print(f"  [re-ingest] participant_id={pid} — profile changed, sha={sha[:12]}")
            reingested += 1

        metadata: dict[str, Any] = {
            "participant_id": row["id"],
            "name": name,
            "course_count": int(row["course_count"]),
        }

        ok = _post_decision(
            wing=WING,
            room="room_guests",
            timestamp=ts_iso,
            title=f"Учасник: {name}",
            content=content,
            rationale=f"Учасник курсів Shuleansky",
            metadata=metadata,
            token=token,
            dry_run=dry_run,
            label=f"participant_{pid}",
        )

        if ok:
            ingested += 1
            if not dry_run:
                par_state[pid] = {
                    "sha256": sha,
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                    "name": name,
                }
        else:
            errors += 1

        time.sleep(RATE_LIMIT_SEC)

    if reingested > 0:
        print(f"  [info] {reingested} participant(s) re-ingested due to profile change")
    return ingested, skipped, errors


# ── Main ──────────────────────────────────────────────────────────────────────


def _check_staleness(t_ing: int, m_ing: int, p_ing: int, conn) -> int:
    """Detect silent stagnation across rooms.

    Returns 1 if no ingest happened in this run AND source DB has rows newer
    than the most-recent ingested record in any room. Non-zero exit causes
    nightly cron (`nightly.sh`) to send a Telegram WARN via TELEGRAM_BOT_TOKEN
    — that is the project-wide "alert through HTTP sidecar / Telegram" path.

    DEV-20260507-0024: rooms stale 18-22 days because per-stream skipped:dedup
    was indistinguishable from skipped:no-source-rows.
    REV-20260512-010: previous version queried Prisma-style table names
    (`"Session"`, `"Material"`) which do not exist in sh DB (real tables are
    `sessions`, `materials` via @@map). The exception was caught silently and
    staleness alert never fired — wing_shuleansky went 23 days stale unnoticed.
    """
    if t_ing + m_ing + p_ing > 0:
        return 0  # at least one room ingested — healthy
    # Quiet run — verify source DB is also quiet (no new rows in 7d)
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM sessions WHERE created_at >= NOW() - INTERVAL '7 days'")
        new_sessions = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM materials WHERE created_at >= NOW() - INTERVAL '7 days'")
        new_materials = cur.fetchone()[0]
        cur.close()
    except Exception as e:
        print(f"[warn] staleness check skipped: {e}", file=sys.stderr)
        return 0
    print(f"[stats] ingested_last_7d=0 sessions_new_7d={new_sessions} materials_new_7d={new_materials}")
    if new_sessions > 0 or new_materials > 0:
        print(
            f"[ERROR] wing_shuleansky stale: source has new sessions={new_sessions} "
            f"materials={new_materials} in last 7d but ingester wrote 0 drawers. "
            f"Likely cause: dedup-by-source_id missed content changes. "
            f"REV-20260512-010 switched to (source_id, sha256) — if you see this "
            f"after the fix, investigate whether sha computation matches DB content.",
            file=sys.stderr,
        )
        return 1
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Shuleansky data into MemPalace (mp_t08)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be ingested without POSTing")
    parser.add_argument("--limit", type=int, default=0, help="Max records per source type (0 = unlimited)")
    parser.add_argument("--since", type=str, default="", help="Only ingest sessions newer than YYYY-MM-DD")
    parser.add_argument("--rebuild", action="store_true",
                        help="Ignore state file and re-consider every record (MP-ARCH-FUTURE-06). "
                             "Insert-time dedup via source_id still prevents duplicates.")
    args = parser.parse_args()

    since_dt: Optional[datetime] = None
    if args.since:
        try:
            since_dt = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            print(f"ERROR: --since must be YYYY-MM-DD, got: {args.since}", file=sys.stderr)
            sys.exit(1)

    token = ""
    if not args.dry_run:
        token = _get_token()

    # Try to connect to DB — graceful warning if unavailable (Mac/dev),
    # hard failure on VPS where sh DB MUST be reachable (REV-20260419-0044).
    try:
        conn = _connect()
    except Exception as e:
        print(f"ERROR: Cannot connect to Shuleansky database (sh@{DB_HOST}:{DB_PORT}/{DB_NAME}): {e}", file=sys.stderr)
        print("ERROR: No data ingested. Set SH_DB_HOST/SH_DB_USER/SH_DB_PASS/PG_HOST env vars if needed.", file=sys.stderr)
        # REV-R2-20260419-0029: Also treat explicit PG_HOST (set by nightly.sh
        # on VPS) as a strong signal we are in prod — any DB unreachable here
        # is a regression, not dev environment.
        if _is_mini_host() or os.environ.get("PG_HOST") or os.environ.get("SH_DB_HOST"):
            print("ERROR: Running on VPS (or PG_HOST/SH_DB_HOST set) — sh DB MUST be reachable. Failing hard so nightly cron surfaces the issue.", file=sys.stderr)
            sys.exit(1)
        print("INFO: Non-VPS host — exiting 0 (expected if sh DB is not available on dev machine).", file=sys.stderr)
        sys.exit(0)

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"[{mode}] Shuleansky ingester — connected to {DB_NAME}@{DB_HOST}:{DB_PORT}")
    if args.limit:
        print(f"  limit={args.limit} per source type")
    if since_dt:
        print(f"  since={args.since}")

    if args.rebuild:
        print("[rebuild] --rebuild flag set → ignoring state file, re-considering all records")
        state = {}
    else:
        state = _load_state()

    # ── Transcripts ────────────────────────────────────────────────────────────
    t_ing, t_skip, t_err = ingest_transcripts(
        conn,
        state=state,
        token=token,
        dry_run=args.dry_run,
        limit=args.limit,
        since_dt=since_dt,
    )

    # ── Materials ──────────────────────────────────────────────────────────────
    m_ing, m_skip, m_err = ingest_materials(
        conn,
        state=state,
        token=token,
        dry_run=args.dry_run,
        limit=args.limit,
        since_dt=since_dt,
    )

    # ── Participants ───────────────────────────────────────────────────────────
    p_ing, p_skip, p_err = ingest_participants(
        conn,
        state=state,
        token=token,
        dry_run=args.dry_run,
        limit=args.limit,
    )

    # DEV-20260507-0024: staleness check (run while conn still open)
    staleness_rc = _check_staleness(t_ing, m_ing, p_ing, conn)

    conn.close()

    # Save state (only on real run)
    if not args.dry_run:
        _save_state(state)

    # Summary
    print(f"\n[{mode}] Summary:")
    print(f"  Transcripts : ingested={t_ing} skipped={t_skip} errors={t_err}")
    print(f"  Materials   : ingested={m_ing} skipped={m_skip} errors={m_err}")
    print(f"  Participants: ingested={p_ing} skipped={p_skip} errors={p_err}")
    total_errors = t_err + m_err + p_err
    if total_errors > 0:
        print(f"\nWARNING: {total_errors} error(s) occurred. Check output above.", file=sys.stderr)
        sys.exit(1)
    if staleness_rc != 0:
        sys.exit(staleness_rc)


if __name__ == "__main__":
    main()
