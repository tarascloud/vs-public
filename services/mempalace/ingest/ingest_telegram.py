#!/usr/bin/env python3
"""Telegram Bot Conversation Ingester — mp_t09.

Reads Telegram bot conversation histories and ingests them into MemPalace
via POST /ingest/convo.

Sources:
  - claude-channels: /home/owner/.claude/channels/telegram/messages.db
      SQLite DB with columns: id, chat_id, message_id, user_id, username, role, content, ts, created_at
      Bot: @yourbot (Claude Code on VPS)
  - pd-bot: pd-bot uses stateless Telegram polling — no conversation history is stored
      (each request is handled independently, no DB persistence of messages)

Usage:
    python3 ingest_telegram.py [--dry-run] [--limit N] [--since YYYY-MM-DD]
    python3 ingest_telegram.py [--source claude-channels|all]
    python3 ingest_telegram.py --reset-state

State file: /opt/docker/mempalace/ingest-state/telegram.json
    {"claude_channels": {"last_processed_id": <int>}}
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Constants ─────────────────────────────────────────────────────────────────

INGEST_URL = "http://127.0.0.1:8031/ingest/convo"
STATE_FILE = Path("/opt/docker/mempalace/ingest-state/telegram.json")
RATE_LIMIT_SEC = 0.3  # 300ms between requests (Ollama embed needs time)
REQUEST_TIMEOUT = 60   # seconds — Ollama embed per chunk

# Claude-channels source
CLAUDE_CHANNELS_DB = Path("/home/owner/.claude/channels/telegram/messages.db")
WING = "wing_workflow"
ROOM = "room_commands"


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
    raise RuntimeError(
        "MEMPALACE_BEARER_TOKEN not found. Set env var or ensure /opt/docker/secrets/.mempalace.env is readable."
    )


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"claude_channels": {"last_processed_id": 0}}


def _save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ── Source: claude-channels (messages.db) ─────────────────────────────────────

def _check_db_staleness() -> None:
    """REV22-052: Warn if messages.db has not been written to in 14+ days.

    The claude-channels Telegram plugin stopped writing to messages.db after
    the plugin was upgraded (last write: 2026-03-27). New messages arrive via
    the plugin:telegram session JSONL path instead and are picked up by
    ingest_claude_sessions.py. This function surfaces the stale-source issue
    so an operator can decide to remove or replace the ingester.
    """
    if not CLAUDE_CHANNELS_DB.exists():
        return
    try:
        import stat as _stat
        mtime = CLAUDE_CHANNELS_DB.stat().st_mtime
        age_days = (time.time() - mtime) / 86400.0
        STALE_DAYS = 14
        if age_days > STALE_DAYS:
            print(
                f"[STALENESS-WARN] {CLAUDE_CHANNELS_DB} last modified {age_days:.0f}d ago "
                f"(threshold: {STALE_DAYS}d). "
                "The claude-channels plugin may no longer write to this DB. "
                "Telegram conversations are now ingested via ingest_claude_sessions.py "
                "(JSONL session files). Consider disabling this ingester if messages.db "
                "remains stale after 30 days.",
                file=sys.stderr,
            )
    except Exception as e:
        print(f"[warn] Could not stat {CLAUDE_CHANNELS_DB}: {e}", file=sys.stderr)


def _fetch_claude_channels(
    since_id: int,
    since_date: Optional[str],
    limit: Optional[int],
) -> list[dict]:
    """Fetch messages from claude-channels telegram SQLite DB."""
    if not CLAUDE_CHANNELS_DB.exists():
        print(f"[warn] Claude channels DB not found: {CLAUDE_CHANNELS_DB}", file=sys.stderr)
        return []

    _check_db_staleness()

    conn = sqlite3.connect(str(CLAUDE_CHANNELS_DB))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    conditions = [f"id > {since_id}"]
    params: list = []

    if since_date:
        conditions.append("ts >= ?")
        params.append(since_date)

    where = " AND ".join(conditions)
    limit_clause = f"LIMIT {limit}" if limit else ""

    sql = f"""
        SELECT id, chat_id, message_id, user_id, username, role, content, ts, created_at
        FROM messages
        WHERE {where}
        ORDER BY id
        {limit_clause}
    """
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()

    messages = []
    for row in rows:
        messages.append({
            "id": row["id"],
            "chat_id": row["chat_id"],
            "message_id": row["message_id"],
            "user_id": row["user_id"],
            "username": row["username"],
            "role": row["role"],
            "content": row["content"],
            "ts": row["ts"],
        })
    return messages


def _group_claude_channels_exchanges(messages: list[dict]) -> list[dict]:
    """Group messages into (user_msg, assistant_msg) exchange pairs.

    Pairs consecutive user→assistant messages from the same chat.
    Orphan messages are ingested alone.
    """
    exchanges: list[dict] = []
    pending_user: Optional[dict] = None

    for msg in messages:
        if msg["role"] == "user":
            if pending_user is not None:
                # Orphan previous user message
                exchanges.append({"user": pending_user, "assistant": None})
            pending_user = msg
        elif msg["role"] == "assistant":
            if pending_user is not None and pending_user["chat_id"] == msg["chat_id"]:
                exchanges.append({"user": pending_user, "assistant": msg})
                pending_user = None
            else:
                # Assistant without matching user
                exchanges.append({"user": None, "assistant": msg})
        else:
            exchanges.append({"user": None, "assistant": msg})

    # Flush remaining orphan
    if pending_user is not None:
        exchanges.append({"user": pending_user, "assistant": None})

    return exchanges


def _build_claude_channels_payload(exchange: dict) -> dict:
    """Build IngestConvoRequest payload from claude-channels exchange."""
    user_msg = exchange.get("user")
    asst_msg = exchange.get("assistant")
    anchor = asst_msg if asst_msg else user_msg

    ts_raw = anchor["ts"]

    # Parse timestamp → ISO 8601 and determine hall
    try:
        # Format may be "2026-03-21T00:58:45.000Z" or "2026-03-21T00:58:45Z"
        ts_clean = ts_raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts_clean)
        dt = dt.astimezone(timezone.utc)
        timestamp = dt.isoformat()
        hall = f"hall_telegram_{dt.strftime('%Y_%m')}"
    except Exception:
        timestamp = ts_raw
        hall = "hall_telegram_unknown"

    # Build participants list
    participants = []
    if user_msg:
        uname = user_msg.get("username") or user_msg.get("user_id", "user")
        if uname not in participants:
            participants.append(uname)
    bot_name = "yourbot"
    if asst_msg:
        bot_name = asst_msg.get("username") or "yourbot"
    if bot_name not in participants:
        participants.append(bot_name)

    # Content
    if user_msg and asst_msg:
        u_label = user_msg.get("username") or "User"
        a_label = asst_msg.get("username") or "Bot"
        content = f"## {u_label}\n{user_msg['content']}\n\n## {a_label}\n{asst_msg['content']}"
        source_id = f"cc_{asst_msg['message_id']}"
        msg_ids = [user_msg["message_id"], asst_msg["message_id"]]
    elif user_msg:
        u_label = user_msg.get("username") or "User"
        content = f"## {u_label}\n{user_msg['content']}"
        source_id = f"cc_user_{user_msg['message_id']}"
        msg_ids = [user_msg["message_id"]]
    else:
        a_label = asst_msg.get("username") or "Bot"
        content = f"## {a_label}\n{asst_msg['content']}"
        source_id = f"cc_{asst_msg['message_id']}"
        msg_ids = [asst_msg["message_id"]]

    chat_id = anchor.get("chat_id", "")

    metadata: dict = {
        "chat_id": chat_id,
        "user_id": anchor.get("user_id", ""),
        "telegram_msg_ids": msg_ids,
        "source_db": str(CLAUDE_CHANNELS_DB),
    }

    return {
        "wing": WING,
        "room": ROOM,
        "hall": hall,
        "timestamp": timestamp,
        "source": "telegram-yourbot",
        "source_id": source_id,
        "content": content,
        "participants": participants,
        "metadata": metadata,
    }


def ingest_claude_channels(
    state: dict,
    token: str,
    dry_run: bool,
    since_date: Optional[str],
    limit: Optional[int],
) -> tuple[int, int, int]:
    """Ingest claude-channels messages. Returns (success, fail, max_id)."""
    src_state = state.get("claude_channels", {"last_processed_id": 0})
    since_id = src_state.get("last_processed_id", 0)

    print(f"\n[claude-channels] Fetching messages id > {since_id}"
          + (f", since {since_date}" if since_date else "")
          + (f", limit {limit}" if limit else ""))

    messages = _fetch_claude_channels(since_id, since_date, limit)
    print(f"[metrics] Raw rows in source: {len(messages)}")
    print(f"[metrics] Scrubber dropped: tracked at sidecar (/ingest/convo audit.log)")
    print(f"[claude-channels] Fetched {len(messages)} raw messages")

    if not messages:
        print("[claude-channels] Nothing to ingest.")
        return 0, 0, since_id

    exchanges = _group_claude_channels_exchanges(messages)
    print(f"[claude-channels] Grouped into {len(exchanges)} exchange(s)")

    max_processed_id = since_id
    success_count = 0
    fail_count = 0

    for i, exchange in enumerate(exchanges):
        payload = _build_claude_channels_payload(exchange)
        print(f"\n  [{i+1}/{len(exchanges)}] source_id={payload['source_id']} hall={payload['hall']}")

        ok = _post_ingest(payload, token, dry_run=dry_run)
        if ok:
            success_count += 1
            for msg in [exchange.get("user"), exchange.get("assistant")]:
                if msg:
                    max_processed_id = max(max_processed_id, msg["id"])
        else:
            fail_count += 1

        if not dry_run:
            time.sleep(RATE_LIMIT_SEC)

    return success_count, fail_count, max_processed_id


# ── HTTP POST ──────────────────────────────────────────────────────────────────

def _post_ingest(payload: dict, token: str, dry_run: bool) -> bool:
    """POST payload to /ingest/convo. Returns True on success."""
    if dry_run:
        print(f"    [dry-run] Would POST source_id={payload['source_id']} hall={payload['hall']}")
        preview = payload["content"][:150].replace("\n", " ")
        print(f"    content: {preview!r}")
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
            print(f"    [ok] source_id={payload['source_id']} status={resp.status} body={resp_body}")
            return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if hasattr(e, "read") else ""
        print(f"    [error] HTTP {e.code}: {err_body}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"    [error] {e}", file=sys.stderr)
        return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest Telegram bot conversation histories into MemPalace"
    )
    parser.add_argument("--dry-run", action="store_true", help="Show what would be ingested, do not POST")
    parser.add_argument("--limit", type=int, default=None, help="Max number of raw messages to fetch per source")
    parser.add_argument("--since", type=str, default=None, help="Only fetch messages since YYYY-MM-DD")
    parser.add_argument(
        "--source",
        choices=["claude-channels", "all"],
        default="all",
        help="Source to ingest: claude-channels (default: all)",
    )
    parser.add_argument("--reset-state", action="store_true", help="Reset state (re-ingest from beginning)")
    parser.add_argument("--rebuild", action="store_true",
                        help="Alias of --reset-state (MP-ARCH-FUTURE-06). Ignores state; "
                             "ON CONFLICT still protects against duplicate inserts.")
    args = parser.parse_args()

    # Load state
    state = _load_state()
    if args.reset_state or args.rebuild:
        state = {"claude_channels": {"last_processed_id": 0}}
        print("[info] State reset (--reset-state or --rebuild).")

    # Get token early (unless dry-run)
    token = ""
    if not args.dry_run:
        token = _get_token()

    total_success = 0
    total_fail = 0

    # ── Source: claude-channels ────────────────────────────────────────────────
    if args.source in ("claude-channels", "all"):
        success, fail, max_id = ingest_claude_channels(
            state=state,
            token=token,
            dry_run=args.dry_run,
            since_date=args.since,
            limit=args.limit,
        )
        total_success += success
        total_fail += fail

        if not args.dry_run and success > 0:
            state["claude_channels"] = {"last_processed_id": max_id}
            _save_state(state)
            print(f"[info] State saved: claude_channels.last_processed_id={max_id}")

    # ── Source: pd-bot ─────────────────────────────────────────────────────────
    # pd-bot is stateless — it processes each Telegram message independently via
    # python-telegram-bot polling and does not persist conversation history to any DB.
    # The only bot with stored history is @yourbot via claude-channels messages.db.
    if args.source == "all":
        print("\n[pd-bot] Skipped — pd-bot is stateless, no conversation history stored.")

    print(f"\n[done] total success={total_success} fail={total_fail}")


if __name__ == "__main__":
    main()
