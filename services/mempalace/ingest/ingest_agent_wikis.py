#!/usr/bin/env python3
"""Agent wikis ingester — MP-WIKI-IMPL-01.

Reads curated markdown files under ``agents/<name>/wiki/`` and
ingests them into MemPalace as drawers under ``wing_agents/room_<agent>``.

Scope (per ADR ``docs/adr/mempalace-agent-wikis-integration.md``):

* Ingest: all ``.md`` files recursively under ``agents/*/wiki/<subdir>/``.
  Wiki files are curated by agents — no prefix/subdir whitelist gate.
* Skip: ``README.md``, ``index.md``, ``log.md``, files starting with ``_``
  (page templates), ``.gitkeep``, ``archive/**``, files in wiki root.
* Source identity: ``agent-wiki:<agent>:<relpath>:<git_sha7>`` — immutable
  versioned per ADR Q6; ``git_sha7`` = short sha of the **last commit that
  modified this file** (``git log -n1 --format=%h -- <path>``), not HEAD.
  Unchanged files → same source_id → ``ON CONFLICT DO NOTHING`` skips.
* Wing/room: ``wing_agents/room_<agent>`` (auto-created on first run).
* Endpoint: POST ``/ingest/convo`` (the only sidecar endpoint that preserves
  ``source_id`` for dedup; ``/ingest/decision`` discards it). ``hall`` is
  set to ``hall_wiki`` and ``participants=[agent]`` so the envelope stays
  self-describing.

Usage::

    python3 ingest_agent_wikis.py [--dry-run] [--limit N] [--since YYYY-MM-DD]
                                  [--rebuild] [--only-agent NAME]

State file: ``/opt/docker/mempalace/ingest-state/agent_wikis.json``::

    {
      "<agent>/<relpath>": {
        "sha": "abc1234",
        "ingested_at": "2026-04-11T...",
        "chunks": 2
      }
    }

On ``--rebuild`` the state file is ignored (every file is re-considered);
ON CONFLICT in the drawers table still prevents duplicates.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
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
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip3 install psycopg2-binary", file=sys.stderr)
    sys.exit(1)


# ── Config ────────────────────────────────────────────────────────────────────

INGEST_CONVO_URL   = "http://127.0.0.1:8031/ingest/convo"
STATE_FILE         = Path("/opt/docker/mempalace/ingest-state/agent_wikis.json")
RATE_LIMIT_SEC     = 0.1
# Max chars per chunk sent upstream — sidecar re-chunks to ~800 char embedding
# chunks internally, but keeping the HTTP payload bounded helps logging.
CHUNK_MAX_CHARS    = 3500

WING               = "wing_agents"
SOURCE             = "agent-wiki"
HALL               = "hall_wiki"

# Repo root — resolved relative to this file (…/services/mempalace/ingest/…).
# On VPS: /opt/repos/vibe-studio
# On worktree: /tmp/agent-mp-wiki-bundle
THIS_FILE = Path(__file__).resolve()
REPO_ROOT = THIS_FILE.parents[3]  # ingest → mempalace → services → <repo_root>
AGENTS_DIR = REPO_ROOT / "agents"

# Filenames to skip (templates, indices, logs)
SKIP_FILENAMES = {"README.md", "index.md", "log.md", ".gitkeep"}


# ── Token ─────────────────────────────────────────────────────────────────────

def _get_token() -> str:
    """Read MEMPALACE_BEARER_TOKEN from env or /opt/docker/secrets/.mempalace.env."""
    token = os.environ.get("MEMPALACE_BEARER_TOKEN") or os.environ.get("MEMPALACE_INGEST_TOKEN")
    if token:
        return token.strip()
    try:
        result = subprocess.run(
            ["sudo", "-n", "cat", "/opt/docker/secrets/.mempalace.env"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if line.startswith(("MEMPALACE_BEARER_TOKEN=", "MEMPALACE_INGEST_TOKEN=")):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    secrets_path = Path("/opt/docker/secrets/.mempalace.env")
    if secrets_path.exists():
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if line.startswith(("MEMPALACE_BEARER_TOKEN=", "MEMPALACE_INGEST_TOKEN=")):
                return line.split("=", 1)[1].strip()
    print("ERROR: MEMPALACE_BEARER_TOKEN not found in env or /opt/docker/secrets/.mempalace.env",
          file=sys.stderr)
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


def _get_mempalace_db_url() -> str:
    """Return mempalace **writer** DB URL with Docker-internal 'pg' hostname
    rewritten to the reachable host (localhost or docker container IP).

    Prefers ``MEMPALACE_WRITER_DB_URL`` (Agent B split — MP-ARCH-FUTURE-02).
    The non-writer ``mempalace`` role is read-only; it lacks INSERT on
    ``drawers``/``wings``/``rooms``. Falls back to ``MEMPALACE_DB_URL`` only
    for legacy deployments.
    """
    pg_host = _resolve_pg_host()

    def _fix(url: str) -> str:
        return url.replace("@pg:", f"@{pg_host}:")

    for env_var in ("MEMPALACE_WRITER_DB_URL", "MEMPALACE_DB_URL"):
        url = os.environ.get(env_var)
        if url:
            return _fix(url)

    # Read from secrets file, preferring writer URL.
    text = ""
    try:
        result = subprocess.run(
            ["sudo", "-n", "cat", "/opt/docker/secrets/.mempalace.env"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            text = result.stdout
    except Exception:
        pass
    if not text:
        p = Path("/opt/docker/secrets/.mempalace.env")
        if p.exists():
            text = p.read_text()
    found: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        for key in ("MEMPALACE_WRITER_DB_URL", "MEMPALACE_DB_URL"):
            if line.startswith(f"{key}="):
                found[key] = line.split("=", 1)[1].strip()
    for key in ("MEMPALACE_WRITER_DB_URL", "MEMPALACE_DB_URL"):
        if key in found:
            return _fix(found[key])

    print("ERROR: MEMPALACE_WRITER_DB_URL / MEMPALACE_DB_URL not found "
          "(needed to auto-create wing_agents/room_<agent>)", file=sys.stderr)
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


# ── git helpers ───────────────────────────────────────────────────────────────

def _git_sha7(repo_root: Path, rel_path: str) -> Optional[str]:
    """Return short (7-char) sha of the last commit that modified this file.

    Returns None if the file is untracked / not in a git repo / git missing.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "log", "-n1", "--format=%h", "--", rel_path],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return None
        sha = result.stdout.strip()
        return sha[:7] if sha else None
    except Exception:
        return None


# ── Wiki discovery ────────────────────────────────────────────────────────────

def _discover_wiki_files(only_agent: Optional[str] = None) -> list[tuple[str, Path]]:
    """Return list of (agent_name, absolute_path) for every ingestible wiki file.

    Recursively walks ``agents/*/wiki/`` and collects all ``.md`` files except:
    - Files in ``SKIP_FILENAMES`` (README.md, index.md, log.md, .gitkeep)
    - Files starting with ``_`` (page templates like _page-template.md)
    - Files under ``archive/`` directories

    Wiki files are curated by agents — no additional prefix/subdir gate needed.
    ``only_agent`` narrows to a single agent (for the onboarding
    ``register-agent.sh`` flow).
    """
    out: list[tuple[str, Path]] = []
    if not AGENTS_DIR.exists():
        print(f"WARNING: agents dir not found: {AGENTS_DIR}", file=sys.stderr)
        return out
    for agent_dir in sorted(AGENTS_DIR.iterdir()):
        if not agent_dir.is_dir():
            continue
        agent = agent_dir.name
        if only_agent and agent != only_agent:
            continue
        wiki_dir = agent_dir / "wiki"
        if not wiki_dir.is_dir():
            continue
        for md in sorted(wiki_dir.rglob("*.md")):
            # Skip files directly in wiki root (README.md, index.md, log.md)
            # and skip archive directories
            rel_to_wiki = md.relative_to(wiki_dir)
            if len(rel_to_wiki.parts) < 2:
                # File directly in wiki/ root — skip (README.md, index.md, etc.)
                continue
            if "archive" in rel_to_wiki.parts:
                continue
            name = md.name
            if name in SKIP_FILENAMES:
                continue
            if name.startswith("_"):
                continue
            out.append((agent, md))
    return out


# ── Chunking ──────────────────────────────────────────────────────────────────

def _chunk_text(text: str, max_chars: int = CHUNK_MAX_CHARS) -> list[str]:
    """Paragraph-aware chunker. Wiki files are small (~30-50 lines) so most
    files return a single chunk. This exists only so the rare long file does
    not blow past upstream's payload expectations.
    """
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    paragraphs = text.split("\n\n")
    current = ""
    for para in paragraphs:
        if len(para) > max_chars:
            # hard-split very long paragraphs
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


# ── Wing/room bootstrap ───────────────────────────────────────────────────────

def _ensure_wing_room(conn, wing: str, room: str) -> None:
    """Insert wings/rooms rows if missing. Required because Drawer has an
    FK on (wing, room) → rooms.(wing, name). Idempotent.

    Each INSERT runs in its own transaction so a failure (e.g. permission
    denied on the first attempt) does not poison subsequent attempts in the
    same connection.
    """
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO wings (name, description) VALUES (%s, %s) "
                "ON CONFLICT (name) DO NOTHING",
                (wing, "Curated agent wikis — authored knowledge, ingested from agents/*/wiki/"),
            )
            cur.execute(
                "INSERT INTO rooms (wing, name, description) VALUES (%s, %s, %s) "
                "ON CONFLICT (wing, name) DO NOTHING",
                (wing, room, f"Wiki pages authored by agent {room.removeprefix('room_')}"),
            )
        conn.commit()
    except Exception:
        # Roll back so the connection is usable again; caller will log.
        try:
            conn.rollback()
        except Exception:
            pass
        raise


def _connect_mempalace_db():
    url = _get_mempalace_db_url()
    parsed = urllib.parse.urlparse(url)
    return psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        user=parsed.username,
        password=parsed.password,
        dbname=parsed.path.lstrip("/"),
        connect_timeout=10,
    )


# ── HTTP helper ───────────────────────────────────────────────────────────────

def _post_convo(
    *,
    wing: str,
    room: str,
    timestamp: str,
    source_id: str,
    content: str,
    agent: str,
    metadata: dict[str, Any],
    token: str,
    dry_run: bool,
    label: str,
) -> bool:
    payload = {
        "wing": wing,
        "room": room,
        "hall": HALL,
        "timestamp": timestamp,
        "source": SOURCE,
        "source_id": source_id,
        "content": content,
        "participants": [agent],
        "metadata": metadata,
    }
    if dry_run:
        print(f"  [DRY-RUN] wiki {label} → {wing}/{room} bytes={len(content)} sid={source_id}")
        return True
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        resp = requests.post(INGEST_CONVO_URL, json=payload, headers=headers, timeout=60)
    except Exception as e:
        print(f"  [FAIL] wiki {label} request_error={e}")
        return False
    if resp.status_code == 202:
        print(f"  [OK]  wiki {label} → {wing}/{room} bytes={len(content)}")
        return True
    print(f"  [FAIL] wiki {label} status={resp.status_code} body={resp.text[:200]}")
    return False


# ── Main ingest ───────────────────────────────────────────────────────────────

def ingest_wiki_file(
    *,
    agent: str,
    abs_path: Path,
    state: dict[str, Any],
    token: str,
    dry_run: bool,
    rebuild: bool,
    since_dt: Optional[datetime],
    created_rooms: set[str],
    db_conn,
) -> tuple[int, int, int]:
    """Returns (ingested_flag, skipped_flag, error_flag) — each 0 or 1 per file."""
    rel_from_repo = abs_path.relative_to(REPO_ROOT)  # agents/<agent>/wiki/...
    rel_in_wiki = abs_path.relative_to(AGENTS_DIR / agent / "wiki")  # entities/entity_xxx.md

    # git sha (versioned source_id)
    sha7 = _git_sha7(REPO_ROOT, str(rel_from_repo))
    if not sha7:
        # Untracked / not committed yet → fall back to "dev" so dev runs still work,
        # but log it so nightly runs on VPS (always committed) don't silently lose files.
        sha7 = "dev0000"
        print(f"  [WARN] no git sha for {rel_from_repo}, using dev0000")

    state_key = f"{agent}/{rel_in_wiki.as_posix()}"
    prev = state.get(state_key)
    if not rebuild and prev and prev.get("sha") == sha7:
        return (0, 1, 0)

    # --since filter: skip files whose latest-commit date < since_dt
    if since_dt:
        try:
            r = subprocess.run(
                ["git", "-C", str(REPO_ROOT), "log", "-n1", "--format=%cI", "--", str(rel_from_repo)],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0 and r.stdout.strip():
                commit_dt = datetime.fromisoformat(r.stdout.strip())
                if commit_dt.tzinfo is None:
                    commit_dt = commit_dt.replace(tzinfo=timezone.utc)
                if commit_dt < since_dt:
                    return (0, 1, 0)
        except Exception:
            pass  # on failure, do not filter

    # Read content
    try:
        raw = abs_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  [FAIL] read {state_key}: {e}")
        return (0, 0, 1)
    if not raw.strip():
        return (0, 1, 0)

    # Extract title from first markdown H1 (fallback to filename)
    title = rel_in_wiki.stem
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("# "):
            title = line[2:].strip()
            break

    wiki_section = rel_in_wiki.stem  # "concept_patterns", "entity_services", ...

    room = f"room_{agent}"

    # Ensure wing + room exist (FK requirement; cheap idempotent INSERT).
    # Skipped in dry-run — no DB connection is opened there.
    if db_conn is not None and room not in created_rooms:
        try:
            _ensure_wing_room(db_conn, WING, room)
        except Exception as e:
            print(f"  [FAIL] ensure_wing_room({WING}/{room}): {e}")
            return (0, 0, 1)
        created_rooms.add(room)

    chunks = _chunk_text(raw)
    ts_iso = datetime.now(timezone.utc).isoformat()
    base_source_id = f"{SOURCE}:{agent}:{rel_in_wiki.as_posix()}:{sha7}"

    ok_all = True
    for i, chunk in enumerate(chunks):
        if len(chunks) == 1:
            source_id = base_source_id
            label = state_key
        else:
            source_id = f"{base_source_id}#{i+1}of{len(chunks)}"
            label = f"{state_key}[{i+1}/{len(chunks)}]"

        metadata = {
            "type": "wiki",
            "agent": agent,
            "wiki_path": rel_in_wiki.as_posix(),
            "wiki_section": wiki_section,
            "git_sha7": sha7,
            "title": title,
            "chunk_index": i,
            "total_chunks": len(chunks),
        }

        ok = _post_convo(
            wing=WING,
            room=room,
            timestamp=ts_iso,
            source_id=source_id,
            content=chunk,
            agent=agent,
            metadata=metadata,
            token=token,
            dry_run=dry_run,
            label=label,
        )
        if not ok:
            ok_all = False
        time.sleep(RATE_LIMIT_SEC)

    if not ok_all:
        return (0, 0, 1)

    if not dry_run:
        state[state_key] = {
            "sha": sha7,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "chunks": len(chunks),
            "title": title,
        }
    return (1, 0, 0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest agent wikis into MemPalace (wing_agents)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be ingested without POSTing")
    parser.add_argument("--limit", type=int, default=0, help="Max files to ingest (0 = unlimited)")
    parser.add_argument("--since", type=str, default="", help="Only ingest files last-modified after YYYY-MM-DD (by git commit)")
    parser.add_argument("--rebuild", action="store_true",
                        help="Ignore state file, re-consider every file (ON CONFLICT still protects)")
    parser.add_argument("--only-agent", type=str, default="",
                        help="Restrict to a single agent (used by scripts/register-agent.sh)")
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

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"[{mode}] agent-wikis ingester — repo_root={REPO_ROOT}")
    if args.rebuild:
        print("  --rebuild: state file ignored")
    if args.only_agent:
        print(f"  --only-agent={args.only_agent}")
    if since_dt:
        print(f"  --since={args.since}")

    files = _discover_wiki_files(only_agent=args.only_agent or None)
    print(f"Discovered {len(files)} wiki file(s) across {len({a for a, _ in files})} agent(s)")
    if not files:
        print("Nothing to ingest.")
        return

    state = _load_state() if not args.rebuild else {}

    # Mempalace DB — needed for wing/room FK bootstrap (ingest_server doesn't do it)
    db_conn = None
    if not args.dry_run:
        try:
            db_conn = _connect_mempalace_db()
        except Exception as e:
            print(f"ERROR: Cannot connect to mempalace DB (needed to bootstrap wing_agents/room_*): {e}",
                  file=sys.stderr)
            sys.exit(1)

    created_rooms: set[str] = set()
    ingested = skipped = errors = 0

    for agent, abs_path in files:
        if args.limit and ingested >= args.limit:
            break
        i, s, e = ingest_wiki_file(
            agent=agent,
            abs_path=abs_path,
            state=state,
            token=token,
            dry_run=args.dry_run,
            rebuild=args.rebuild,
            since_dt=since_dt,
            created_rooms=created_rooms,
            db_conn=db_conn,
        )
        ingested += i
        skipped += s
        errors += e

    if db_conn:
        db_conn.close()

    if not args.dry_run:
        _save_state(state)

    print(f"\n[{mode}] Summary:")
    print(f"  agent-wikis : ingested={ingested} skipped={skipped} errors={errors}")
    if errors > 0:
        print(f"\nWARNING: {errors} error(s) occurred. See output above.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
