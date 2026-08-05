#!/usr/bin/env python3
"""PD AI Chat History Ingester — mp_t07.

Reads conversation exchanges from pd_prod.chat_history and ingests them
into MemPalace via POST /ingest/convo.

Usage:
    python3 ingest_pd_chat.py [--dry-run] [--limit N] [--since YYYY-MM-DD] [--user-id N]

State file: /opt/docker/mempalace/ingest-state/pd_chat.json
    {"last_processed_id": <int>}  — idempotent incremental ingestion
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────────────────

INGEST_URL = "http://127.0.0.1:8031/ingest/convo"
STATE_FILE = Path("/opt/docker/mempalace/ingest-state/pd_chat.json")
WING = "wing_pd"
ROOM = "room_ai_chat"
SOURCE = "pd-chat"
PARTICIPANTS = ["owner", "pd-assistant"]
RATE_LIMIT_SEC = 0.3  # 300ms between requests (Ollama embed needs time)
REQUEST_TIMEOUT = 60  # seconds — Ollama embed per chunk


def _get_token() -> str:
    """Read MEMPALACE_BEARER_TOKEN from env or .mempalace.env."""
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
    except Exception as e:
        print(f"[warn] Could not read .mempalace.env: {e}", file=sys.stderr)
    raise RuntimeError("MEMPALACE_BEARER_TOKEN not found. Set env var or ensure /opt/docker/secrets/.mempalace.env is readable.")


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"last_processed_id": 0}


def _save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def _run_psql(sql: str) -> list[list[str]]:
    """Execute SQL against pd_prod via docker exec pg psql, return rows as list of field lists.

    Uses --csv format so multiline content is properly quoted/escaped.
    Runs locally on VPS (docker exec) or via ssh vps if not on VPS.
    """
    import csv
    import io

    # Build psql command with CSV output (handles newlines in content)
    psql_cmd = f"docker exec pg psql -U pd -d pd_prod --csv -t -c \"{sql}\""

    # Detect if we are already on VPS (hostname == "vps")
    try:
        host_result = subprocess.run(["hostname"], capture_output=True, text=True, timeout=5)
        on_mini = host_result.stdout.strip() == "vps"
    except Exception:
        on_mini = False

    if on_mini:
        cmd = ["bash", "-c", psql_cmd]
    else:
        cmd = ["ssh", "vps", psql_cmd]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"psql error: {result.stderr.strip()}")

    rows = []
    reader = csv.reader(io.StringIO(result.stdout))
    for row in reader:
        if row:  # skip empty rows
            rows.append(row)
    return rows


def _parse_user_ids(raw: str) -> list[int]:
    """Parse comma-separated user_id list from string. Returns sorted list of ints."""
    return sorted({int(x.strip()) for x in raw.split(",") if x.strip()})


def _default_user_ids() -> list[int]:
    """Read USER_IDS env var (comma-sep). Falls back to [1] if unset.

    REV-20260512-009: previously hardcoded user_id=1, missing user 810.
    Default is now USER_IDS=1,810 to include both Owner (1) and sounddummies (810).
    Override via env: USER_IDS=1,810,... or --user-id CLI flag for single-user mode.
    """
    raw = os.environ.get("USER_IDS", "1,810")
    return _parse_user_ids(raw)


def _fetch_messages(
    since_id: int,
    since_date: Optional[str],
    user_ids: Optional[list[int]],
    limit: Optional[int],
) -> list[dict]:
    """Fetch chat_history rows ordered by id > since_id."""
    conditions = [f"id > {since_id}"]
    if since_date:
        conditions.append(f"created_at >= '{since_date}'::date")
    if user_ids:
        id_list = ", ".join(str(u) for u in user_ids)
        conditions.append(f"user_id IN ({id_list})")

    where = " AND ".join(conditions)
    limit_clause = f"LIMIT {limit}" if limit else ""

    sql = (
        f"SELECT id, user_id, role, content, user_email, "
        f"to_char(created_at, 'YYYY-MM-DD HH24:MI:SS TZ') "
        f"FROM chat_history WHERE {where} ORDER BY id {limit_clause}"
    )

    raw_rows = _run_psql(sql)
    messages = []
    for parts in raw_rows:
        if len(parts) < 6:
            continue
        messages.append({
            "id": int(parts[0]),
            "user_id": int(parts[1]),
            "role": parts[2],
            "content": parts[3],
            "user_email": parts[4],
            "created_at": parts[5],
        })
    return messages


def _group_exchanges(messages: list[dict]) -> list[dict]:
    """Group messages into (user_msg, assistant_msg) exchange pairs.

    Strategy: iterate in order. When we see a 'user' message, hold it.
    When we see the next 'assistant' message for the same user_id, pair them.
    Orphan user messages (no following assistant) are ingested alone.
    """
    exchanges: list[dict] = []
    pending_user: Optional[dict] = None

    for msg in messages:
        if msg["role"] == "user":
            if pending_user is not None:
                # Orphan previous user message — no assistant response
                exchanges.append({"user": pending_user, "assistant": None})
            pending_user = msg
        elif msg["role"] == "assistant":
            if pending_user is not None and pending_user["user_id"] == msg["user_id"]:
                exchanges.append({"user": pending_user, "assistant": msg})
                pending_user = None
            else:
                # Assistant without user — ingest alone
                exchanges.append({"user": None, "assistant": msg})
        else:
            # Unknown role — ingest as-is
            exchanges.append({"user": None, "assistant": msg})

    # Flush remaining orphan
    if pending_user is not None:
        exchanges.append({"user": pending_user, "assistant": None})

    return exchanges


def _build_payload(exchange: dict) -> dict:
    """Build IngestConvoRequest payload from exchange."""
    user_msg = exchange.get("user")
    asst_msg = exchange.get("assistant")

    # Use assistant message as the anchor (it's the "response" and has final timestamp)
    anchor = asst_msg if asst_msg else user_msg
    ts_raw = anchor["created_at"]

    # Parse timestamp → ISO 8601
    try:
        # Format: "2026-03-14 22:24:19 UTC"
        dt = datetime.strptime(ts_raw, "%Y-%m-%d %H:%M:%S %Z")
        dt = dt.replace(tzinfo=timezone.utc)
        timestamp = dt.isoformat()
        hall = f"hall_chat_{dt.strftime('%Y_%m')}"
    except Exception:
        timestamp = ts_raw
        hall = "hall_chat_unknown"

    # Content
    if user_msg and asst_msg:
        content = f"## User\n{user_msg['content']}\n\n## Assistant\n{asst_msg['content']}"
        source_id = str(asst_msg["id"])
        pd_msg_ids = [user_msg["id"], asst_msg["id"]]
    elif user_msg:
        content = f"## User\n{user_msg['content']}"
        source_id = f"user_{user_msg['id']}"
        pd_msg_ids = [user_msg["id"]]
    else:
        content = f"## Assistant\n{asst_msg['content']}"
        source_id = str(asst_msg["id"])
        pd_msg_ids = [asst_msg["id"]]

    metadata: dict = {
        "user_id": anchor["user_id"],
        "user_email": anchor.get("user_email", ""),
        "pd_msg_ids": pd_msg_ids,
    }

    return {
        "wing": WING,
        "room": ROOM,
        "hall": hall,
        "timestamp": timestamp,
        "source": SOURCE,
        "source_id": source_id,
        "content": content,
        "participants": PARTICIPANTS,
        "metadata": metadata,
    }


def _post_ingest(payload: dict, token: str, dry_run: bool) -> bool:
    """POST payload to /ingest/convo. Returns True on success."""
    if dry_run:
        print(f"  [dry-run] Would POST source_id={payload['source_id']} hall={payload['hall']}")
        print(f"    content preview: {payload['content'][:120].replace(chr(10), ' ')!r}")
        return True

    import urllib.request
    import urllib.error

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        INGEST_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            resp_body = resp.read().decode()
            print(f"  [ok] source_id={payload['source_id']} status={resp.status} body={resp_body}")
            return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if hasattr(e, "read") else ""
        print(f"  [error] HTTP {e.code}: {err_body}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  [error] {e}", file=sys.stderr)
        return False



def _check_staleness(messages_count: int, since_id: int, user_ids: Optional[list[int]] = None) -> int:
    """Detect silent stagnation.

    Returns 0 if healthy, 1 if source DB has new rows in last 7d but this run
    ingested 0 (silent failure pattern: queries succeed, dedup misclassifies, etc).

    REV-20260512-009: also checks MAX(id) > since_id for tracked user_ids and emits
    WARN if there are unprocessed rows (not just last-7d heuristic).

    DEV-20260507-0023: PD AI Chat ingester silently stagnant since 2026-04-10
    (27d) because dedup logic masked the issue. Staleness check makes the gap
    surface in nightly cron output.
    """
    if messages_count > 0:
        return 0  # ran fine
    # Quiet run — check if source DB is also quiet
    try:
        # Check 1: new rows in last 7d (any user)
        cmd = [
            'docker', 'exec', 'pg', 'psql', '-U', 'pd', '-d', 'pd_prod',
            '-tAc', "SELECT COUNT(*) FROM chat_history WHERE created_at >= NOW() - INTERVAL '7 days'"
        ]
        out = subprocess.check_output(cmd, timeout=10).decode().strip()
        new_in_db = int(out)
    except Exception as e:
        print(f'[warn] staleness check skipped: {e}', file=sys.stderr)
        return 0
    print(f'[stats] ingested_last_7d=0 source_new_last_7d={new_in_db} since_id={since_id}')
    rc = 0
    if new_in_db > 0:
        print(f'[ERROR] Source has {new_in_db} new rows in last 7d but ingested 0. '
              f'Check dedup, embed, and last_processed_id={since_id}.', file=sys.stderr)
        rc = 1
    # Check 2: MAX(id) > since_id for our tracked user_ids (REV-20260512-009)
    if user_ids:
        try:
            id_list = ", ".join(str(u) for u in user_ids)
            sql = f"SELECT COUNT(*) FROM chat_history WHERE id > {since_id} AND user_id IN ({id_list})"
            cmd2 = ['docker', 'exec', 'pg', 'psql', '-U', 'pd', '-d', 'pd_prod', '-tAc', sql]
            out2 = subprocess.check_output(cmd2, timeout=10).decode().strip()
            unprocessed = int(out2)
            if unprocessed > 0:
                print(f'[WARN] {unprocessed} row(s) with id>{since_id} for user_ids={user_ids} '
                      f'not ingested this run. Possible filter mismatch.', file=sys.stderr)
                rc = max(rc, 1)
        except Exception as e:
            print(f'[warn] user-scoped staleness check skipped: {e}', file=sys.stderr)
    return rc


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest PD AI chat history into MemPalace")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be ingested, do not POST")
    parser.add_argument("--limit", type=int, default=None, help="Max number of raw messages to fetch")
    parser.add_argument("--since", type=str, default=None, help="Only fetch messages since YYYY-MM-DD")
    parser.add_argument("--user-id", type=int, default=None,
                        help="Filter by single user_id (legacy compat). Overrides USER_IDS env.")
    parser.add_argument("--user-ids", type=str, default=None,
                        help="Comma-sep list of user_ids, e.g. 1,810. Overrides USER_IDS env.")
    parser.add_argument("--reset-state", action="store_true", help="Reset state (re-ingest from beginning)")
    parser.add_argument("--rebuild", action="store_true",
                        help="Alias of --reset-state (MP-ARCH-FUTURE-06). Ignores state; "
                             "ON CONFLICT still protects against duplicate inserts.")
    args = parser.parse_args()

    # Resolve user_ids: CLI --user-id (legacy) > --user-ids > USER_IDS env > default [1,810]
    if args.user_id is not None:
        effective_user_ids: list[int] = [args.user_id]
    elif args.user_ids is not None:
        effective_user_ids = _parse_user_ids(args.user_ids)
    else:
        effective_user_ids = _default_user_ids()

    # Load state
    state = _load_state()
    if args.reset_state or args.rebuild:
        state = {"last_processed_id": 0}
        print("[info] State reset (--reset-state or --rebuild).")

    since_id = state["last_processed_id"]
    print(f"[info] Fetching chat_history for user_ids={effective_user_ids}, id > {since_id}"
          + (f", since {args.since}" if args.since else "")
          + (f", limit {args.limit}" if args.limit else ""))

    # Fetch messages
    messages = _fetch_messages(
        since_id=since_id,
        since_date=args.since,
        user_ids=effective_user_ids,
        limit=args.limit,
    )
    print(f"[metrics] Raw rows in source: {len(messages)}")
    print(f"[metrics] Scrubber dropped: tracked at sidecar (/ingest/convo audit.log)")
    print(f"[info] Fetched {len(messages)} raw messages")

    if not messages:
        print("[info] Nothing to ingest.")
        return

    # Group into exchanges
    exchanges = _group_exchanges(messages)
    print(f"[info] Grouped into {len(exchanges)} exchange(s)")

    # Get token (not needed for dry-run but validate early)
    token = ""
    if not args.dry_run:
        token = _get_token()

    # Ingest
    max_processed_id = since_id
    success_count = 0
    fail_count = 0

    for i, exchange in enumerate(exchanges):
        payload = _build_payload(exchange)
        print(f"\n[{i+1}/{len(exchanges)}] exchange: source_id={payload['source_id']}")

        ok = _post_ingest(payload, token, dry_run=args.dry_run)
        if ok:
            success_count += 1
            # Track highest id seen in this exchange
            for msg in [exchange.get("user"), exchange.get("assistant")]:
                if msg:
                    max_processed_id = max(max_processed_id, msg["id"])
        else:
            fail_count += 1

        if not args.dry_run:
            time.sleep(RATE_LIMIT_SEC)

    print(f"\n[done] success={success_count} fail={fail_count} max_id={max_processed_id}")

    # Save state (only on real run, not dry-run)
    if not args.dry_run and success_count > 0:
        state["last_processed_id"] = max_processed_id
        _save_state(state)
        print(f"[info] State saved: last_processed_id={max_processed_id}")
    elif args.dry_run:
        print("[info] Dry-run — state NOT updated.")

    # DEV-20260507-0023 + REV-20260512-009: detect silent stagnation
    rc = _check_staleness(success_count, since_id, user_ids=effective_user_ids)
    if rc != 0:
        sys.exit(rc)


if __name__ == "__main__":
    main()
