#!/usr/bin/env python3
"""Ingest ~/.claude/projects/*/memory/*.md files into MemPalace — REV22-052.

These files contain agent feedback one-liners (MEMORY.md) and per-topic
feedback pages (feedback_*.md, project_*.md, reference_*.md). They were
ingested once manually on 2026-05-04 but not on subsequent nights, causing
new feedback items to go unindexed.

This ingester:
  - Scans CLAUDE_PROJECTS_DIR/**/memory/*.md (primary VPS dir)
  - Optionally scans CLAUDE_EXTRA_PROJECTS_DIR (Mac sessions synced via rsync)
  - Ingests each .md file as a MemPalace drawer in wing_workflow / room_feedback
  - Keeps incremental state (mtime + content hash) in a JSON state file
  - Runs as the 7th ingester in nightly.sh

Usage:
    python3 ingest_memory_md.py [--dry-run] [--rebuild]

State file: /opt/docker/mempalace/ingest-state/memory_md.json
  {"<abs_path>": {"mtime": <float>, "content_hash": "<sha256[:16]>"}}
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
WING = "wing_workflow"
ROOM = "room_feedback"
RATE_LIMIT_SLEEP = 0.3
REQUEST_TIMEOUT = int(os.environ.get("INGEST_HTTP_TIMEOUT", "120"))

STATE_FILE = Path(
    os.environ.get("INGEST_STATE_FILE_MEMORY", "/opt/docker/mempalace/ingest-state/memory_md.json")
)

# Only ingest files in memory/ subdirectories
MEMORY_SUBDIR = "memory"

# Skip the MEMORY.md index file itself — it only contains one-liners that
# reference the actual feedback/*.md pages. Ingest the individual pages instead.
# Set to False to ingest MEMORY.md as well.
SKIP_MEMORY_INDEX = False


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
    print("ERROR: MEMPALACE_TOKEN not found.", file=sys.stderr)
    sys.exit(1)


def _load_state() -> dict[str, Any]:
    if STATE_FILE.exists():
        try:
            data = json.loads(STATE_FILE.read_text())
            if isinstance(data, dict):
                return data
        except Exception as e:
            print(f"[WARN] Failed to load state {STATE_FILE}: {e}")
    return {}


def _save_state(state: dict[str, Any]) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True))
        tmp.replace(STATE_FILE)
    except Exception as e:
        print(f"[WARN] Failed to save state {STATE_FILE}: {e}")


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:16]


def _post_ingest(payload: dict, token: str, dry_run: bool) -> bool:
    if dry_run:
        print(f"  [DRY-RUN] Would ingest source_id={payload['source_id']} "
              f"content_len={len(payload['content'])}")
        return True
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        resp = requests.post(INGEST_URL, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
        if resp.status_code == 202:
            print(f"  [OK] {payload['source_id']}")
            return True
        else:
            print(f"  [FAIL] {payload['source_id']} status={resp.status_code} body={resp.text[:80]}")
            return False
    except Exception as e:
        print(f"  [FAIL] {payload['source_id']} error={e}")
        return False


def _collect_memory_files(base_dirs: list[Path]) -> list[Path]:
    """Collect all *.md files under memory/ subdirectories in base_dirs."""
    files: list[Path] = []
    for base in base_dirs:
        if not base.is_dir():
            continue
        for memory_dir in base.rglob(MEMORY_SUBDIR):
            if memory_dir.is_dir():
                for md in sorted(memory_dir.glob("*.md")):
                    if SKIP_MEMORY_INDEX and md.name == "MEMORY.md":
                        continue
                    files.append(md)
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest memory/*.md into MemPalace room_feedback")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--rebuild", action="store_true",
                        help="Re-ingest all files regardless of state")
    args = parser.parse_args()

    token = ""
    if not args.dry_run:
        token = _get_token()

    state = {} if args.rebuild else _load_state()

    # Collect base directories
    base_dirs: list[Path] = [CLAUDE_PROJECTS_DIR]
    if CLAUDE_EXTRA_PROJECTS_DIR and CLAUDE_EXTRA_PROJECTS_DIR.exists():
        base_dirs.append(CLAUDE_EXTRA_PROJECTS_DIR)

    md_files = _collect_memory_files(base_dirs)
    print(f"[metrics] Raw rows in source: {len(md_files)} memory/*.md files")

    total_ingested = 0
    total_skipped = 0
    total_errors = 0

    for md_file in md_files:
        abs_key = str(md_file.resolve())
        try:
            text = md_file.read_text(encoding="utf-8", errors="replace").strip()
        except Exception as e:
            print(f"  [ERROR] {md_file}: {e}")
            total_errors += 1
            continue

        if not text:
            total_skipped += 1
            continue

        mtime = md_file.stat().st_mtime
        chash = _content_hash(text)

        prev = state.get(abs_key, {})
        if (
            not args.rebuild
            and prev.get("mtime") == mtime
            and prev.get("content_hash") == chash
        ):
            total_skipped += 1
            continue

        # Build source_id from relative path within .claude/projects
        try:
            rel = md_file.relative_to(Path("/home/owner/.claude/projects"))
            source_id = f"memory_md:{rel}"
        except ValueError:
            source_id = f"memory_md:{md_file.name}"

        timestamp = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        hall = f"hall_feedback_{datetime.fromtimestamp(mtime, tz=timezone.utc).strftime('%Y_%m')}"

        payload = {
            "wing": WING,
            "room": ROOM,
            "hall": hall,
            "timestamp": timestamp,
            "source": "memory-md",
            "source_id": source_id,
            "content": text,
            "participants": ["owner"],
            "metadata": {
                "file": md_file.name,
                "abs_path": abs_key,
            },
        }

        ok = _post_ingest(payload, token, args.dry_run)
        if ok:
            total_ingested += 1
            if not args.dry_run:
                state[abs_key] = {"mtime": mtime, "content_hash": chash}
        else:
            total_errors += 1

        time.sleep(RATE_LIMIT_SLEEP)

    if not args.dry_run:
        _save_state(state)

    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"\n[{mode}] Done: ingested={total_ingested} skipped={total_skipped} errors={total_errors}")


if __name__ == "__main__":
    main()
