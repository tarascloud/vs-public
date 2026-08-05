"""Scrubber integration for the MemPalace ingestion sidecar.

Extracted from ingest_server.py (god-file split, cmq8l618n005x01lrtjy30xcs).
Behaviour preserved verbatim:

F-04: Fail-closed — scrubber init failure → sys.exit(1); scrub() failure
raises RuntimeError which the caller maps to HTTP 500.
"""
from __future__ import annotations

import logging
import os
import sys

_scrubber = None
_scrubber_secrets_count = 0


def init_scrubber(audit) -> int:
    """Initialise the module-level Scrubber instance (fail-closed).

    Logs startup to the provided AuditLogger. On any failure prints FATAL,
    attempts an audit record and exits the process with code 1 (F-04).
    Returns the number of secrets loaded into the scrubber index.
    """
    global _scrubber, _scrubber_secrets_count
    try:
        from scrubber import Scrubber
        secrets_dir = os.environ.get("SECRETS_DIR", "/secrets")
        _scrubber = Scrubber(secrets_dir=secrets_dir)
        _scrubber_secrets_count = (
            len(_scrubber.secrets_index) if _scrubber.secrets_index is not None else 0
        )
        audit.log_startup(
            scrubber_ok=True,
            secrets_dir=secrets_dir,
            secrets_count=_scrubber_secrets_count,
        )
    except Exception as e:
        err = f"scrubber init failed: {e}"
        print(f"[mempalace-ingest] FATAL: {err}", file=sys.stderr)
        try:
            audit.log_scrubber_fail(error=err)
        except Exception:
            pass
        sys.exit(1)
    return _scrubber_secrets_count


def scrub(text: str) -> tuple[str, int, int]:
    """Scrub text, return (cleaned_text, bytes_redacted, findings_count).

    F-04: _scrubber is never None at this point (sys.exit on init fail).
    Raises RuntimeError if scrub() throws — caller handles → 500.
    """
    try:
        cleaned, findings = _scrubber.scrub(text)
    except Exception as e:
        raise RuntimeError(f"scrubber.scrub() raised: {e}") from e
    bytes_redacted = len(text.encode()) - len(cleaned.encode())
    if findings:
        logging.getLogger("mempalace.ingest").info(
            "scrubber redacted %d pattern(s), ~%d bytes from content",
            len(findings), bytes_redacted,
        )
    return cleaned, bytes_redacted, len(findings)
