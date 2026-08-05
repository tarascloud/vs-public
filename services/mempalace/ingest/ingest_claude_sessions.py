#!/usr/bin/env python3
"""Ingest Claude Code sessions into MemPalace.

Reads JSONL session files from /home/owner/.claude/projects/{project}/
and posts each session as a conversation chunk to /ingest/convo.

Supports multiple source directories: the default VPS sessions path plus
an optional extra directory (e.g. Mac sessions synced via rsync/scp).
Sessions are deduplicated by sessionId across all sources.

Usage:
    python3 ingest_claude_sessions.py [--dry-run] [--limit N] [--since YYYY-MM-DD] [--project PROJECT]

Incremental state is kept in a central JSON file:
    /opt/docker/mempalace/ingest-state/claude_sessions.json

Structure:
    {
      "<project_name>": {
        "<session_file.jsonl>": {
          "last_offset": <int lines processed>,
          "last_mtime": "<iso timestamp>",
          "sessions": ["sessionId", ...]  # ingested session ids from this file
        }
      }
    }

Legacy per-project state (.mp_ingested.json next to JSONL files) is still
honored for backwards compatibility — if a session_id is listed there, it is
treated as already ingested.

Environment variables:
    MEMPALACE_BEARER_TOKEN / MEMPALACE_TOKEN  — auth bearer token (required)
    INGEST_HTTP_TIMEOUT   — POST timeout in seconds (default: 120)
    INGEST_STATE_FILE     — override central state path
    INGEST_RETRY_DELAYS   — comma-separated seconds (default: "5,15,45")
    CLAUDE_EXTRA_PROJECTS_DIR — extra directory to scan for .jsonl files
                                (e.g. /home/owner/.claude/projects/_mac)
"""

from __future__ import annotations

import argparse
import json
import os
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

# ── Config ────────────────────────────────────────────────────────────────────

CLAUDE_PROJECTS_DIR = Path("/home/owner/.claude/projects")
CLAUDE_EXTRA_PROJECTS_DIR: Optional[Path] = None
_extra_raw = os.environ.get("CLAUDE_EXTRA_PROJECTS_DIR", "").strip()
if _extra_raw:
    CLAUDE_EXTRA_PROJECTS_DIR = Path(_extra_raw)
INGEST_URL = "http://127.0.0.1:8031/ingest/convo"
STATE_FILE_NAME = ".mp_ingested.json"  # legacy per-project state
RATE_LIMIT_SLEEP = 0.3  # 300ms between requests (Ollama embed needs time)

# HTTP timeout is env-configurable (MP-FIX-20260411-02)
REQUEST_TIMEOUT = int(os.environ.get("INGEST_HTTP_TIMEOUT", "120"))

# Central incremental state file (host path — ingester runs on host, not in container)
CENTRAL_STATE_FILE = Path(
    os.environ.get("INGEST_STATE_FILE", "/opt/docker/mempalace/ingest-state/claude_sessions.json")
)

# Retry policy: exponential backoff on ReadTimeout/ConnectionError/5xx
_retry_raw = os.environ.get("INGEST_RETRY_DELAYS", "5,15,45")
RETRY_DELAYS = [int(x.strip()) for x in _retry_raw.split(",") if x.strip()]

# Progress log cadence (chunks)
PROGRESS_EVERY = 50

# mp_t12a: chunk large sessions before POST so each request stays within
# Ollama nomic-embed-text context limit (~3800 chars) and server timeout.
CHUNK_SIZE = 800    # chars per ingest chunk
CHUNK_OVERLAP = 100  # overlap between chunks
MIN_CHUNK = 50       # skip tiny chunks


def _chunk_text(text: str) -> list[str]:
    """Split text into chunks for ingest. Paragraph-aware, with overlap."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= CHUNK_SIZE:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        if end < len(text):
            pp = text.rfind("\n\n", start, end)
            if pp > start + CHUNK_SIZE // 2:
                end = pp
            else:
                nl = text.rfind("\n", start, end)
                if nl > start + CHUNK_SIZE // 2:
                    end = nl
        chunk = text[start:end].strip()
        if len(chunk) >= MIN_CHUNK:
            chunks.append(chunk)
        start = end - CHUNK_OVERLAP if end < len(text) else end
    return chunks if chunks else [text[:CHUNK_SIZE]]


# Token is read from env or secrets file — NEVER logged
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


# ── Central incremental state helpers (MP-FIX-20260411-02) ────────────────────

def _load_central_state() -> dict[str, Any]:
    """Load central incremental state. Returns {} if not found or invalid."""
    if CENTRAL_STATE_FILE.exists():
        try:
            data = json.loads(CENTRAL_STATE_FILE.read_text())
            if isinstance(data, dict):
                return data
        except Exception as e:
            print(f"[WARN] Failed to load central state {CENTRAL_STATE_FILE}: {e}")
    return {}


def _save_central_state(state: dict[str, Any]) -> None:
    """Save central incremental state atomically."""
    try:
        CENTRAL_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = CENTRAL_STATE_FILE.with_suffix(".json.tmp")
        tmp_path.write_text(json.dumps(state, indent=2, sort_keys=True))
        tmp_path.replace(CENTRAL_STATE_FILE)
    except Exception as e:
        print(f"[WARN] Failed to save central state {CENTRAL_STATE_FILE}: {e}")


# ── Legacy per-project state helpers ──────────────────────────────────────────

def _load_legacy_state(project_dir: Path) -> dict[str, Any]:
    """Load legacy per-project .mp_ingested.json. Returns {} if not found."""
    state_path = project_dir / STATE_FILE_NAME
    if state_path.exists():
        try:
            return json.loads(state_path.read_text())
        except Exception:
            return {}
    return {}


# ── JSONL parsing ─────────────────────────────────────────────────────────────

def _extract_text(content: Any) -> str:
    """Extract plain text from a message content field (str or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                # skip tool_use, tool_result, thinking blocks — they are verbose
        return "\n".join(p for p in parts if p)
    return ""


def _parse_session_file(
    jsonl_path: Path,
    *,
    start_line: int = 0,
) -> tuple[dict[str, list[dict[str, Any]]], int]:
    """Parse a .jsonl file starting from start_line (0-based).

    Returns a tuple ({sessionId: [messages]}, total_lines_read).
    total_lines_read is the absolute line count of the file (to persist as last_offset).
    """
    sessions: dict[str, list[dict[str, Any]]] = {}
    total_lines = 0
    with jsonl_path.open("r", encoding="utf-8", errors="replace") as fh:
        for line_no, raw_line in enumerate(fh):
            total_lines = line_no + 1
            if line_no < start_line:
                continue
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                obj = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            entry_type = obj.get("type", "")
            if entry_type not in ("user", "assistant"):
                continue

            session_id = obj.get("sessionId", "")
            if not session_id:
                continue

            uuid = obj.get("uuid", "")
            timestamp = obj.get("timestamp", "")
            is_meta = obj.get("isMeta", False)
            msg = obj.get("message", {})
            role = msg.get("role", entry_type)
            text = _extract_text(msg.get("content", ""))

            if not text.strip():
                continue

            if session_id not in sessions:
                sessions[session_id] = []
            sessions[session_id].append({
                "uuid": uuid,
                "timestamp": timestamp,
                "role": role,
                "text": text,
                "isMeta": is_meta,
            })

    return sessions, total_lines


# ── Markdown builder ──────────────────────────────────────────────────────────

def _build_markdown(messages: list[dict[str, Any]]) -> str:
    """Build markdown text from session messages (skip isMeta)."""
    parts: list[str] = []
    for msg in messages:
        if msg.get("isMeta"):
            continue
        role = msg["role"]
        text = msg["text"].strip()
        if not text:
            continue
        heading = "## User" if role == "user" else "## Assistant"
        parts.append(f"{heading}\n{text}")
    return "\n\n".join(parts)


# ── HTTP POST with retry (MP-FIX-20260411-02) ─────────────────────────────────

def _post_with_retry(
    *,
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    label: str,
) -> Optional[requests.Response]:
    """POST with exponential-backoff retry on timeout / connection / 5xx.

    Returns the final Response (even if non-2xx) or None if all attempts failed
    due to transient network errors.
    """
    attempts = len(RETRY_DELAYS) + 1
    last_exc: Optional[Exception] = None
    for attempt in range(1, attempts + 1):
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
        except (requests.Timeout, requests.ConnectionError) as e:
            last_exc = e
            if attempt < attempts:
                delay = RETRY_DELAYS[attempt - 1]
                print(f"  [RETRY] {label} attempt={attempt}/{attempts} err={type(e).__name__} sleep={delay}s")
                time.sleep(delay)
                continue
            print(f"  [FAIL] {label} gave up after {attempts} attempts: {type(e).__name__}: {e}")
            return None

        if resp.status_code >= 500 and attempt < attempts:
            delay = RETRY_DELAYS[attempt - 1]
            print(f"  [RETRY] {label} attempt={attempt}/{attempts} status={resp.status_code} sleep={delay}s")
            time.sleep(delay)
            continue
        return resp

    if last_exc is not None:
        print(f"  [FAIL] {label} last error: {last_exc}")
    return None


# ── Ingest ────────────────────────────────────────────────────────────────────

# Global chunk counter for progress logging
_global_chunk_count = 0


def _ingest_session(
    *,
    session_id: str,
    messages: list[dict[str, Any]],
    project_name: str,
    file_name: str,
    token: str,
    dry_run: bool,
    parent_session_id: Optional[str] = None,
) -> bool:
    """Build payload and POST to /ingest/convo. Returns True on success.

    When parent_session_id is set (REV22-018 append-delta path), session_id
    is the unique append source_id (e.g. "<orig>:append<offset>") and
    parent_session_id is the original session_id stored in metadata so
    MemPalace can group append chunks with the base session.
    """
    global _global_chunk_count

    markdown = _build_markdown(messages)
    if not markdown.strip():
        return False

    # Determine timestamp (first message timestamp)
    timestamps = [m["timestamp"] for m in messages if m.get("timestamp")]
    first_ts = min(timestamps) if timestamps else datetime.now(timezone.utc).isoformat()

    # hall = hall_sessions_YYYY_MM
    try:
        dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
        hall = f"hall_sessions_{dt.strftime('%Y_%m')}"
    except Exception:
        hall = "hall_sessions_unknown"

    # For append-delta chunks, record the original session_id in metadata
    meta_session_id = parent_session_id if parent_session_id else session_id

    payload = {
        "wing": "wing_workflow",
        "room": "room_sessions",
        "hall": hall,
        "timestamp": first_ts,
        "source": "claude-code",
        "source_id": session_id,
        "content": markdown,
        "participants": ["owner", "claude"],
        "metadata": {
            "project": project_name,
            "sessionId": meta_session_id,
            "file": file_name,
            "message_count": len([m for m in messages if not m.get("isMeta")]),
            **({"appendDelta": True, "baseSessionId": parent_session_id} if parent_session_id else {}),
        },
    }

    # mp_t12a: chunk markdown before POST — keeps each request within Ollama context limit
    chunks = _chunk_text(markdown)
    if not chunks:
        return False

    if dry_run:
        print(f"  [DRY-RUN] Would ingest session={session_id[:8]}... "
              f"project={project_name} hall={hall} "
              f"messages={payload['metadata']['message_count']} "
              f"content_len={len(markdown)} chunks={len(chunks)}")
        return True

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    ok_count = 0
    for i, chunk in enumerate(chunks):
        chunk_payload = dict(payload)
        chunk_payload["content"] = chunk
        chunk_payload["source_id"] = f"{session_id}:chunk{i}"

        label = f"session={session_id[:8]} chunk={i}/{len(chunks)}"
        resp = _post_with_retry(url=INGEST_URL, payload=chunk_payload, headers=headers, label=label)

        _global_chunk_count += 1
        if _global_chunk_count % PROGRESS_EVERY == 0:
            print(f"  [PROGRESS] chunks_sent={_global_chunk_count}")

        if resp is None:
            # transient failure after retries — continue to next chunk
            continue
        if resp.status_code == 202:
            ok_count += 1
        else:
            print(f"  [FAIL] session={session_id[:8]} chunk={i} status={resp.status_code} body={resp.text[:100]}")

        if i < len(chunks) - 1:
            time.sleep(RATE_LIMIT_SLEEP)

    if ok_count > 0:
        print(f"  [OK] session={session_id[:8]}... project={project_name} hall={hall} "
              f"messages={payload['metadata']['message_count']} "
              f"chunks={ok_count}/{len(chunks)} total_bytes={len(markdown)}")
        return True
    else:
        print(f"  [FAIL] session={session_id[:8]}... all {len(chunks)} chunks failed")
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Claude Code sessions into MemPalace")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be ingested without POSTing")
    parser.add_argument("--limit", type=int, default=0, help="Max number of sessions to ingest (0 = unlimited)")
    parser.add_argument("--since", type=str, default="", help="Only ingest sessions newer than YYYY-MM-DD")
    parser.add_argument("--project", type=str, default="all", help="Project directory name or 'all'")
    parser.add_argument("--rebuild", action="store_true",
                        help="Ignore state file and re-consider every session (MP-ARCH-FUTURE-06). "
                             "ON CONFLICT (source_id) DO NOTHING at insert time still protects against duplicates.")
    args = parser.parse_args()

    # Parse --since filter
    since_dt: Optional[datetime] = None
    if args.since:
        try:
            since_dt = datetime.strptime(args.since, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            print(f"ERROR: --since must be YYYY-MM-DD, got: {args.since}", file=sys.stderr)
            sys.exit(1)

    # Get token (skip in dry-run to allow testing without secrets)
    token = ""
    if not args.dry_run:
        token = _get_token()

    # Enumerate project directories from all sources
    if not CLAUDE_PROJECTS_DIR.exists():
        print(f"ERROR: {CLAUDE_PROJECTS_DIR} does not exist", file=sys.stderr)
        sys.exit(1)

    # Collect directories from primary source
    if args.project == "all":
        project_dirs = [d for d in sorted(CLAUDE_PROJECTS_DIR.iterdir()) if d.is_dir()]
    else:
        project_dir = CLAUDE_PROJECTS_DIR / args.project
        if not project_dir.is_dir():
            print(f"ERROR: project dir not found: {project_dir}", file=sys.stderr)
            sys.exit(1)
        project_dirs = [project_dir]

    # Collect directories from extra source (e.g. Mac sessions synced via rsync).
    # The extra dir can contain:
    #   a) subdirectories with .jsonl files (mirrors primary structure), OR
    #   b) flat .jsonl files directly (e.g. scp *.jsonl into _mac/)
    # We handle both: scan subdirs AND the extra dir itself if it has .jsonl files.
    if CLAUDE_EXTRA_PROJECTS_DIR and CLAUDE_EXTRA_PROJECTS_DIR.exists():
        extra_dirs: list[Path] = []
        if args.project == "all":
            # Add subdirs (project-like structure)
            extra_dirs = [d for d in sorted(CLAUDE_EXTRA_PROJECTS_DIR.iterdir()) if d.is_dir()]
            # Also add the extra dir itself if it contains .jsonl files anywhere
            # (rglob — subagent sessions live in <session-id>/subagents/agent-*.jsonl)
            if list(CLAUDE_EXTRA_PROJECTS_DIR.rglob("*.jsonl")):
                extra_dirs.insert(0, CLAUDE_EXTRA_PROJECTS_DIR)
        else:
            extra_dir = CLAUDE_EXTRA_PROJECTS_DIR / args.project
            extra_dirs = [extra_dir] if extra_dir.is_dir() else []
        if extra_dirs:
            print(f"Extra source ({CLAUDE_EXTRA_PROJECTS_DIR}): {len(extra_dirs)} dirs with sessions")
            project_dirs.extend(extra_dirs)
    elif CLAUDE_EXTRA_PROJECTS_DIR:
        print(f"[WARN] CLAUDE_EXTRA_PROJECTS_DIR={CLAUDE_EXTRA_PROJECTS_DIR} does not exist, skipping")

    print(f"Projects found: {len(project_dirs)}")
    extra_label = str(CLAUDE_EXTRA_PROJECTS_DIR) if CLAUDE_EXTRA_PROJECTS_DIR else "none"
    print(f"Config: timeout={REQUEST_TIMEOUT}s retry_delays={RETRY_DELAYS} state_file={CENTRAL_STATE_FILE} extra_dir={extra_label}")
    # MP-FIX-AI-20260601: rglob picks up subagent sessions written under
    # <session-id>/subagents/agent-*.jsonl (Claude Code now writes parent
    # session + N subagent sessions per Task tool call). Before this fix
    # only top-level *.jsonl were ingested → ~95% of agent-execution
    # context was silently dropped.
    for pd in project_dirs:
        jsonl_files = list(pd.rglob("*.jsonl"))
        print(f"  {pd.name}: {len(jsonl_files)} .jsonl files (recursive)")
    # MP-METRICS-0050: explicit raw-rows metric for observability
    _total_jsonl = sum(len(list(pd.rglob("*.jsonl"))) for pd in project_dirs)
    print(f"[metrics] Raw rows in source: {_total_jsonl} jsonl files across {len(project_dirs)} projects")
    print(f"[metrics] Scrubber dropped: tracked per-POST at sidecar; see /opt/docker/mempalace/palace/audit.log")

    # Load central incremental state
    # MP-ARCH-FUTURE-06: --rebuild discards the state file so every session is
    # re-considered; insert dedup via source_id still prevents duplicates.
    if args.rebuild:
        print("[rebuild] --rebuild flag set → ignoring central state file, re-considering all sessions")
        central_state = {}
    else:
        central_state = _load_central_state()
    central_dirty = False

    total_ingested = 0
    total_skipped = 0
    total_errors = 0
    limit_reached = False

    # Cross-source dedup: collect all session IDs already known across ALL
    # projects/files in central state so that a session synced from Mac into
    # _mac/ is not re-ingested if it was already processed from the primary dir.
    globally_known_sessions: set[str] = set()
    for proj_state in central_state.values():
        if isinstance(proj_state, dict):
            for file_state_val in proj_state.values():
                if isinstance(file_state_val, dict):
                    for sid in file_state_val.get("sessions", []):
                        globally_known_sessions.add(sid)

    for project_dir in project_dirs:
        if limit_reached:
            break

        project_name = project_dir.name
        # MP-FIX-AI-20260601: rglob — pick up subagent JSONLs under
        # <session-id>/subagents/agent-*.jsonl
        jsonl_files = sorted(project_dir.rglob("*.jsonl"))

        if not jsonl_files:
            continue

        # Legacy per-project state — used to skip already-ingested session ids
        # (ignored under --rebuild for MP-ARCH-FUTURE-06 semantics).
        if args.rebuild:
            legacy_sessions = {}
        else:
            legacy_state = _load_legacy_state(project_dir)
            legacy_sessions = legacy_state.get("ingested_sessions", {}) or {}

        # Central project state
        project_state: dict[str, Any] = central_state.setdefault(project_name, {})

        for jsonl_path in jsonl_files:
            if limit_reached:
                break

            # MP-FIX-AI-20260601: use relative path (not just filename) so
            # nested subagent files (<session-id>/subagents/agent-*.jsonl)
            # get independent state slots — otherwise two agent-*.jsonl
            # files with the same basename would clobber each other.
            try:
                file_key = str(jsonl_path.relative_to(project_dir))
            except ValueError:
                file_key = jsonl_path.name
            file_state: dict[str, Any] = project_state.setdefault(file_key, {})
            last_offset = int(file_state.get("last_offset", 0) or 0)
            try:
                mtime_iso = datetime.fromtimestamp(
                    jsonl_path.stat().st_mtime, tz=timezone.utc
                ).isoformat()
            except Exception:
                mtime_iso = ""

            try:
                sessions, total_lines = _parse_session_file(jsonl_path, start_line=last_offset)
            except Exception as e:
                print(f"  [ERROR] Failed to parse {jsonl_path.name}: {e}")
                total_errors += 1
                continue

            # Known sessions already recorded for this file (from central state)
            known_sessions: set[str] = set(file_state.get("sessions", []) or [])

            # REV22-018: per-session last_offset tracks how many lines were
            # previously ingested FOR EACH session_id. Used to detect append-
            # delta so long-running tmux sessions (days/weeks) continue to be
            # ingested as new messages arrive, not skipped after the first day.
            # Schema: file_state["session_offsets"] = {"<session_id>": <int line count>}
            session_offsets: dict[str, int] = dict(
                file_state.get("session_offsets", {}) or {}
            )

            for session_id, messages in sessions.items():
                if limit_reached:
                    break

                # Determine whether this is a brand-new session or an append to
                # a known session.
                # REV22-018: "known" means it was ingested before (present in
                # known_sessions / legacy_sessions / globally_known_sessions).
                # For known sessions we ingest the DELTA (messages parsed from
                # the new lines) as a separate chunk with a distinct source_id
                # (session_id + ":append" + last_offset).  Unknown sessions are
                # ingested whole as before.
                is_known_legacy = session_id in legacy_sessions
                is_known_central = session_id in known_sessions
                is_known_global = session_id in globally_known_sessions
                is_known = is_known_legacy or is_known_central or is_known_global

                if is_known and not messages:
                    # Session was seen before and no new messages in the delta window
                    total_skipped += 1
                    continue

                if not is_known and not messages:
                    # Completely empty — skip
                    total_skipped += 1
                    continue

                if not is_known:
                    # Apply --since filter only for brand-new sessions
                    if since_dt:
                        ts_list = [m["timestamp"] for m in messages if m.get("timestamp")]
                        if ts_list:
                            try:
                                first_ts_dt = datetime.fromisoformat(min(ts_list).replace("Z", "+00:00"))
                                if first_ts_dt < since_dt:
                                    total_skipped += 1
                                    continue
                            except Exception:
                                pass

                    # Brand-new session — ingest whole
                    success = _ingest_session(
                        session_id=session_id,
                        messages=messages,
                        project_name=project_name,
                        file_name=file_key,
                        token=token,
                        dry_run=args.dry_run,
                    )
                    if success:
                        total_ingested += 1
                        if not args.dry_run:
                            known_sessions.add(session_id)
                            globally_known_sessions.add(session_id)
                            session_offsets[session_id] = last_offset
                            central_dirty = True
                        time.sleep(RATE_LIMIT_SLEEP)
                    else:
                        total_errors += 1
                else:
                    # REV22-018: known session — ingest DELTA as append chunk.
                    # source_id = "<session_id>:append<last_offset>" so the
                    # MemPalace ON CONFLICT(source_id) dedup still works correctly
                    # (each delta window gets a unique source_id).
                    prev_offset = session_offsets.get(session_id, 0)
                    if last_offset <= prev_offset:
                        # No new lines for this session since last run
                        total_skipped += 1
                        continue

                    append_source_id = f"{session_id}:append{prev_offset}"
                    success = _ingest_session(
                        session_id=append_source_id,
                        messages=messages,
                        project_name=project_name,
                        file_name=file_key,
                        token=token,
                        dry_run=args.dry_run,
                        # Pass the original session_id in metadata so MemPalace
                        # can group chunks by session
                        parent_session_id=session_id,
                    )
                    if success:
                        total_ingested += 1
                        if not args.dry_run:
                            session_offsets[session_id] = last_offset
                            central_dirty = True
                        time.sleep(RATE_LIMIT_SLEEP)
                    else:
                        total_errors += 1

                if args.limit > 0 and total_ingested >= args.limit:
                    limit_reached = True
                    break

            # Persist file-level progress (offset + mtime + sessions) after each file
            if not args.dry_run:
                file_state["last_offset"] = total_lines
                file_state["last_mtime"] = mtime_iso
                file_state["sessions"] = sorted(known_sessions)
                file_state["session_offsets"] = session_offsets
                central_dirty = True

        # Save central state after each project to minimize data loss on crash
        if central_dirty and not args.dry_run:
            _save_central_state(central_state)
            central_dirty = False

    # Final save (in case last project was skipped)
    if central_dirty and not args.dry_run:
        _save_central_state(central_state)

    # Summary — keep format in sync with nightly.sh parser:
    #   ingested=N skipped=N errors=N
    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"\n[{mode}] Done: ingested={total_ingested} skipped={total_skipped} errors={total_errors}")


if __name__ == "__main__":
    main()
