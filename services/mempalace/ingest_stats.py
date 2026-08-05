"""Dashboard stats routes for the MemPalace ingestion sidecar (MP-UI-DASHBOARD-01).

Extracted from ingest_server.py (god-file split, cmq8l618n005x01lrtjy30xcs).
Behaviour preserved verbatim. All routes bearer-auth, read-only aggregations
on the drawers table plus log-file parsing for ingest runs and scrubber
findings.

Wiring: ingest_server.py calls `create_stats_router(...)` after auth/log-path
setup and includes the returned APIRouter on the app — a factory avoids a
circular import between this module and ingest_server.
"""
from __future__ import annotations

import gzip as _gzip
import json as _json
import re as _re
from collections import defaultdict
from datetime import datetime as _datetime, timedelta as _timedelta, timezone as _tz
from pathlib import Path
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text as _sql_text

from db import session_scope


def _parse_iso(s: Optional[str]) -> Optional[_datetime]:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return _datetime.fromisoformat(s)
    except Exception:
        return None


_SUMMARY_RE = _re.compile(
    r"\[(?P<ts>[^\]]+)\]\s*SUMMARY\s+ingester=(?P<ingester>\S+)\s+"
    r"status=(?P<status>\S+)\s+ingested=(?P<ingested>\d+)\s+"
    r"skipped=(?P<skipped>\d+)\s+errors=(?P<errors>\d+)"
    r"(?:\s+duration_sec=(?P<duration>[\d.]+))?"
)


def _normalize_summary_ts(raw: str) -> str:
    """Best-effort RFC3339 normalization of SUMMARY timestamps.

    Accepts both the new canonical form (`2026-05-13T04:49:11Z`) and the
    legacy bash-style form (`2026-05-13_04:49:11`). Returns the original
    string if it cannot be parsed — the caller still gets *something*
    rather than dropping the row.
    """
    if not raw:
        return raw
    if _parse_iso(raw):
        return raw
    if len(raw) >= 19 and raw[10] == "_":
        candidate = raw[:10] + "T" + raw[11:19] + "Z"
        if _parse_iso(candidate):
            return candidate
    return raw


def _read_log_tail(path: Path, max_bytes: int = 200_000) -> str:
    """Return up to the last max_bytes of a log file as text. Handles .gz.

    Returns "" on any error or missing file.
    """
    if not path.exists():
        return ""
    try:
        if path.suffix == ".gz":
            with _gzip.open(path, "rb") as f:
                raw = f.read()
            return raw[-max_bytes:].decode("utf-8", errors="ignore")
        size = path.stat().st_size
        with path.open("rb") as f:
            if size > max_bytes:
                f.seek(-max_bytes, 2)
            return f.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _parse_ingest_log(ingest_log_path: str, limit: int) -> list[dict]:
    """Parse last N SUMMARY lines from ingest log. Returns newest-first.

    Field names match the status collector contract
    (`/services/status/collectors/mempalace.go`): `run_id`, `started_at`,
    `duration_secs`. Gracefully returns [] on missing/unreadable file.

    Reads the most recent rotated file (.1.gz) in addition to the live log:
    logrotate runs `copytruncate` at 00:00 UTC, blanking the live log until
    the next nightly run at 04:45 UTC. Without the rotated fallback the
    parser returns [] for ~4.75h every night, tripping a false
    "ingest stale" alert in the status monitor.
    """
    path = Path(ingest_log_path)
    rotated = Path(str(ingest_log_path) + ".1.gz")

    # Older (rotated) content first, live content last — chronological order.
    data = _read_log_tail(rotated) + _read_log_tail(path)
    if not data:
        return []

    matches = list(_SUMMARY_RE.finditer(data))
    matches = matches[-limit:]
    out = []
    for m in matches:
        started_at = _normalize_summary_ts(m.group("ts"))
        ingester = m.group("ingester")
        out.append(
            {
                "run_id": f"{started_at}|{ingester}",
                "started_at": started_at,
                "ingester": ingester,
                "status": m.group("status"),
                "ingested": int(m.group("ingested")),
                "skipped": int(m.group("skipped")),
                "errors": int(m.group("errors")),
                "duration_secs": int(float(m.group("duration") or 0)),
            }
        )
    # Newest-first: collector and alerter read index [0] as the most recent run.
    out.reverse()
    return out


def create_stats_router(
    *,
    check_bearer: Callable[[Request], None],
    audit_log_path: str,
    ingest_log_path: str,
) -> APIRouter:
    """Build the /stats/* APIRouter with injected auth + log paths."""
    router = APIRouter()

    @router.get("/stats/overview")
    async def stats_overview(request: Request) -> dict:
        """Top-level summary card data: totals, wing/room counts, last ingest, health."""
        check_bearer(request)
        try:
            with session_scope() as s:
                total = s.execute(_sql_text("SELECT COUNT(*) FROM drawers")).scalar() or 0
                wing_rows = s.execute(
                    _sql_text("SELECT wing, COUNT(*) AS c FROM drawers GROUP BY wing ORDER BY c DESC")
                ).all()
                room_rows = s.execute(
                    _sql_text(
                        "SELECT wing || '/' || room AS wr, COUNT(*) AS c "
                        "FROM drawers GROUP BY wing, room ORDER BY c DESC LIMIT 20"
                    )
                ).all()
                last_ingest = s.execute(
                    _sql_text("SELECT MAX(filed_at) FROM drawers")
                ).scalar()
                db_size = s.execute(
                    _sql_text(
                        "SELECT pg_total_relation_size('drawers')"
                    )
                ).scalar() or 0

            return {
                "total_drawers": int(total),
                "wings": {w: int(c) for w, c in wing_rows},
                "rooms": {wr: int(c) for wr, c in room_rows},
                "last_ingest_ts": last_ingest.isoformat() if last_ingest else None,
                "health": "ok",
                "version": "2.0.0",
                "db_size_bytes": int(db_size),
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"overview failed: {e}")

    @router.get("/stats/timeseries")
    async def stats_timeseries(
        request: Request,
        from_: Optional[str] = None,
        to: Optional[str] = None,
        bucket: str = "day",
    ) -> list[dict]:
        """Drawers filed per bucket (day/week/hour) stacked by wing.

        Query params:
          from  — ISO date/datetime, defaults to 30 days ago
          to    — ISO date/datetime, defaults to now
          bucket — day|week|hour (default: day)
        """
        check_bearer(request)
        bucket_sql = {"day": "day", "week": "week", "hour": "hour"}.get(bucket, "day")

        dt_from = _parse_iso(from_) or (_datetime.now(_tz.utc) - _timedelta(days=30))
        dt_to = _parse_iso(to) or _datetime.now(_tz.utc)

        try:
            with session_scope() as s:
                rows = s.execute(
                    _sql_text(
                        f"SELECT date_trunc(:bucket, filed_at) AS d, wing, COUNT(*) AS c "
                        f"FROM drawers WHERE filed_at >= :dt_from AND filed_at <= :dt_to "
                        f"GROUP BY d, wing ORDER BY d"
                    ),
                    {"bucket": bucket_sql, "dt_from": dt_from, "dt_to": dt_to},
                ).all()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"timeseries failed: {e}")

        # Pivot: {date_iso: {wing: count}}
        buckets: dict[str, dict[str, int]] = defaultdict(dict)
        all_wings: set[str] = set()
        for d, wing, c in rows:
            key = d.isoformat() if hasattr(d, "isoformat") else str(d)
            buckets[key][wing or "unknown"] = int(c)
            all_wings.add(wing or "unknown")

        result = []
        for key in sorted(buckets.keys()):
            row = {"date": key}
            for w in all_wings:
                row[f"wing_{w}"] = buckets[key].get(w, 0)
            result.append(row)
        return result

    @router.get("/stats/ingest-runs")
    async def stats_ingest_runs(request: Request, limit: int = 30) -> list[dict]:
        """Recent ingest runs parsed from the nightly log. Empty list if log absent."""
        check_bearer(request)
        limit = max(1, min(500, limit))
        return _parse_ingest_log(ingest_log_path, limit)

    @router.get("/stats/scrubber")
    async def stats_scrubber(
        request: Request, from_: Optional[str] = None, to: Optional[str] = None
    ) -> list[dict]:
        """Per-day scrubber findings and blocked writes from audit log.

        Parses /data/palace/audit.log (append-only JSONL).
        """
        check_bearer(request)
        path = Path(audit_log_path)
        if not path.exists():
            return []

        dt_from = _parse_iso(from_) or (_datetime.now(_tz.utc) - _timedelta(days=30))
        dt_to = _parse_iso(to) or _datetime.now(_tz.utc)

        by_day: dict[str, dict[str, int]] = defaultdict(lambda: {"findings_total": 0, "blocked_writes": 0})
        try:
            with path.open("r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = _json.loads(line)
                    except Exception:
                        continue
                    ts_raw = rec.get("ts") or rec.get("timestamp")
                    dt = _parse_iso(ts_raw) if isinstance(ts_raw, str) else None
                    if dt is None:
                        continue
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=_tz.utc)
                    if dt < dt_from or dt > dt_to:
                        continue
                    day_key = dt.date().isoformat()
                    findings = int(rec.get("findings_count", 0) or 0)
                    status_val = rec.get("status", "")
                    if findings > 0:
                        by_day[day_key]["findings_total"] += findings
                    if status_val == "error" or status_val == "blocked":
                        by_day[day_key]["blocked_writes"] += 1
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"scrubber stats failed: {e}")

        return [
            {"date": d, **vals}
            for d, vals in sorted(by_day.items())
        ]

    @router.get("/stats/recent-drawers")
    async def stats_recent_drawers(request: Request, limit: int = 20) -> list[dict]:
        """Most recently filed drawers (newest first) with content preview."""
        check_bearer(request)
        limit = max(1, min(200, limit))
        try:
            with session_scope() as s:
                rows = s.execute(
                    _sql_text(
                        "SELECT id, wing, room, source, source_file, LEFT(content, 300) AS preview, filed_at "
                        "FROM drawers ORDER BY filed_at DESC LIMIT :lim"
                    ),
                    {"lim": limit},
                ).all()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"recent-drawers failed: {e}")

        out = []
        for r in rows:
            out.append(
                {
                    "id": r[0],
                    "wing": r[1],
                    "room": r[2],
                    "source": r[3],
                    "source_file": r[4],
                    "content_preview": r[5],
                    "filed_at": r[6].isoformat() if r[6] else None,
                }
            )
        return out

    @router.get("/stats/top-rooms")
    async def stats_top_rooms(request: Request, limit: int = 10) -> list[dict]:
        """Top N rooms by drawer count with growth over last 7 days."""
        check_bearer(request)
        limit = max(1, min(100, limit))
        try:
            with session_scope() as s:
                rows = s.execute(
                    _sql_text(
                        """
                        SELECT wing, room,
                               COUNT(*) AS total,
                               MAX(filed_at) AS last_added,
                               COUNT(*) FILTER (WHERE filed_at >= NOW() - INTERVAL '7 days') AS growth_7d
                        FROM drawers
                        GROUP BY wing, room
                        ORDER BY total DESC
                        LIMIT :lim
                        """
                    ),
                    {"lim": limit},
                ).all()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"top-rooms failed: {e}")

        return [
            {
                "wing": r[0],
                "room": r[1],
                "count": int(r[2]),
                "last_added": r[3].isoformat() if r[3] else None,
                "growth_7d": int(r[4]),
            }
            for r in rows
        ]

    return router
