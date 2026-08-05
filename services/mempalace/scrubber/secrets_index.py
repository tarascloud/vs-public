"""Exact-match index of known secret values sourced from /opt/docker/secrets/*.env.

At construction time, reads every readable .env file and extracts the VALUE
portion of each KEY=VALUE line. Values shorter than MIN_LEN are ignored to
avoid false positives (e.g. "NODE_ENV=production").

On scrub, any occurrence of these values in input text is redacted to
<REDACTED:ENV_FILE>. Graceful fallback: unreadable files (permission denied,
missing) are silently skipped.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Iterable

MIN_LEN = 16
DEFAULT_SECRETS_DIR = "/opt/docker/secrets"


def _parse_env_line(line: str) -> str | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if "=" not in line:
        return None
    _, value = line.split("=", 1)
    # Strip surrounding quotes
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    return value or None


def load_env_values(secrets_dir: str | Path = DEFAULT_SECRETS_DIR,
                    min_len: int = MIN_LEN) -> set[str]:
    """Load all env values >= min_len chars from *.env files.

    Silently skips unreadable files. Returns a set of raw values.
    """
    d = Path(secrets_dir)
    values: set[str] = set()
    if not d.is_dir():
        return values
    try:
        entries = list(d.iterdir())
    except (PermissionError, OSError):
        return values
    for entry in entries:
        if not entry.is_file():
            continue
        name = entry.name
        if not (name.endswith(".env") or ".env" in name):
            continue
        try:
            text = entry.read_text(encoding="utf-8", errors="replace")
        except (PermissionError, OSError):
            continue
        for line in text.splitlines():
            v = _parse_env_line(line)
            if v and len(v) >= min_len:
                values.add(v)
    return values


class SecretsIndex:
    """Holds a set of raw secret values and replaces them in text."""

    def __init__(self, values: Iterable[str] | None = None,
                 secrets_dir: str | Path = DEFAULT_SECRETS_DIR,
                 min_len: int = MIN_LEN):
        if values is None:
            values = load_env_values(secrets_dir, min_len=min_len)
        # Longer secrets first — prevents a shorter substring of a larger
        # secret being redacted first and leaving the suffix dangling.
        self._values = sorted(
            {v for v in values if len(v) >= min_len},
            key=len,
            reverse=True,
        )

    def __len__(self) -> int:
        return len(self._values)

    def scrub(self, text: str) -> tuple[str, int]:
        """Return (scrubbed_text, count_of_replacements)."""
        count = 0
        for v in self._values:
            if v in text:
                count += text.count(v)
                text = text.replace(v, "<REDACTED:ENV_FILE>")
        return text, count
