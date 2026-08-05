"""MemPalace — append-only audit logger.

Writes JSON-lines to /data/palace/audit.log (mode 600, UID 1000).
Each line is fsynced for durability.

Format per line:
  {
    "ts":              <int unix epoch>,
    "op":              "ingest" | "search" | "startup" | "scrubber_fail",
    "endpoint":        "/ingest/convo" | ...,
    "source":          <str>,           # logical sender (req.source)
    "client_ip":       <str>,           # request.client.host, "unknown" if absent
    "forwarded_for":   <str>,           # X-Forwarded-For header, "" if absent
    "user_agent":      <str>,           # User-Agent header, "" if absent
    "bytes_in":        <int>,
    "bytes_redacted":  <int>,
    "findings_count":  <int>,
    "status":          "ok" | "error" | "scrubber_unavailable",
    "error":           <str | null>
  }

ADR §9.1 step 5 — satisfies: timestamp, source, pattern matched (via findings_count),
redaction count (bytes_redacted + findings_count).

MP-SEC-20260411-03 — added client_ip / forwarded_for / user_agent for observability.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

DEFAULT_AUDIT_LOG = "/data/palace/audit.log"


class AuditLogger:
    """Thread-safe (GIL), append-only, line-buffered audit writer."""

    def __init__(self, log_path: str = DEFAULT_AUDIT_LOG):
        self._path = Path(log_path)
        # Ensure parent exists (created by Docker bind-mount, but be safe)
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass  # will fail on open() if truly inaccessible
        # Open line-buffered; creates file if needed
        self._fh = open(self._path, "a", buffering=1, encoding="utf-8")
        # chmod 600 — only UID 1000 (container user) reads it
        try:
            os.chmod(self._path, 0o600)
        except OSError:
            pass

    # ── Public API ────────────────────────────────────────────────────────────

    def log_ingest(
        self,
        *,
        endpoint: str,
        source: str,
        bytes_in: int,
        bytes_redacted: int,
        findings_count: int,
        status: str = "ok",
        error: Optional[str] = None,
        client_ip: str = "unknown",
        forwarded_for: str = "",
        user_agent: str = "",
    ) -> None:
        self._write({
            "ts": int(time.time()),
            "op": "ingest",
            "endpoint": endpoint,
            "source": source,
            "client_ip": client_ip,
            "forwarded_for": forwarded_for,
            "user_agent": user_agent,
            "bytes_in": bytes_in,
            "bytes_redacted": bytes_redacted,
            "findings_count": findings_count,
            "status": status,
            "error": error,
        })

    def log_startup(self, *, scrubber_ok: bool, secrets_dir: str, secrets_count: int) -> None:
        self._write({
            "ts": int(time.time()),
            "op": "startup",
            "scrubber_ok": scrubber_ok,
            "secrets_dir": secrets_dir,
            "secrets_count": secrets_count,
        })

    def log_scrubber_fail(self, *, error: str) -> None:
        self._write({
            "ts": int(time.time()),
            "op": "scrubber_fail",
            "error": error,
        })

    # ── Internal ──────────────────────────────────────────────────────────────

    def _write(self, record: dict) -> None:
        line = json.dumps(record, ensure_ascii=False) + "\n"
        self._fh.write(line)
        # fsync for O_APPEND durability (line-buffered already flushes on \n,
        # but fsync ensures kernel → disk)
        try:
            os.fsync(self._fh.fileno())
        except OSError:
            pass

    def close(self) -> None:
        try:
            self._fh.close()
        except OSError:
            pass
