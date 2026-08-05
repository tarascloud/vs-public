"""Scrubber — top-level API.

Usage:
    from scrubber import Scrubber
    s = Scrubber()  # loads env index from /opt/docker/secrets by default
    cleaned, findings = s.scrub("my text with sk-ant-api03-...")

The scrub order is:
    1. Multi-line secrets (SSH keys) and regex patterns (high confidence first)
    2. Generic HEX_API (low confidence, runs last)
    3. Exact-match env index pass (replaces any verbatim env values)

Each regex replacement is recorded as a Finding. Env-index replacements are
aggregated into a single synthetic Finding per run (start=-1, end=-1) so the
caller sees that an env match happened without leaking indices of the
original positions in the mutating buffer.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .findings import Finding
from .patterns import PATTERNS, SecretPattern
from .secrets_index import SecretsIndex, DEFAULT_SECRETS_DIR


@dataclass
class Scrubber:
    """Redacts secrets from free-form text."""

    patterns: list[SecretPattern] = None  # type: ignore[assignment]
    secrets_index: SecretsIndex | None = None
    load_env: bool = True
    secrets_dir: str | Path = DEFAULT_SECRETS_DIR

    def __post_init__(self) -> None:
        if self.patterns is None:
            self.patterns = list(PATTERNS)
        if self.secrets_index is None and self.load_env:
            self.secrets_index = SecretsIndex(secrets_dir=self.secrets_dir)

    def scrub(self, text: str) -> tuple[str, list[Finding]]:
        """Return (redacted_text, list_of_findings).

        Findings are produced against the ORIGINAL text positions, so after
        the scan finishes we apply replacements in one pass from right to
        left to preserve indices.
        """
        findings: list[Finding] = []
        # Track byte ranges already claimed, so lower-confidence patterns
        # cannot re-match inside a higher-confidence hit.
        claimed: list[tuple[int, int]] = []

        def overlaps(a: int, b: int) -> bool:
            for ca, cb in claimed:
                if a < cb and b > ca:
                    return True
            return False

        # Each entry: (start, end, pattern_name, original_secret, confidence,
        #              replace_start, replace_end, prefix, suffix)
        # replace_start/end delimit the span that becomes <REDACTED:NAME>.
        # prefix/suffix are kept verbatim around the marker.
        matches: list[tuple[int, int, str, str, str, int, int, str, str]] = []
        for p in self.patterns:
            for m in p.regex.finditer(text):
                s, e = m.start(), m.end()
                if overlaps(s, e):
                    continue
                claimed.append((s, e))
                if p.secret_group and p.secret_group > 0:
                    # Only the capture group is the secret; keep the rest.
                    g = m.group(p.secret_group)
                    gs, ge = m.start(p.secret_group), m.end(p.secret_group)
                    prefix = text[s:gs]
                    suffix = text[ge:e]
                    matches.append((s, e, p.name, g, p.confidence, gs, ge, prefix, suffix))
                else:
                    matches.append((s, e, p.name, m.group(0), p.confidence, s, e, "", ""))

        # Replace from right to left so earlier indices stay valid.
        matches.sort(key=lambda t: t[0], reverse=True)
        buf = text
        for s, e, name, original, conf, rs, re_, prefix, suffix in matches:
            findings.append(Finding.from_match(name, rs, re_, original, conf))
            buf = buf[:s] + prefix + f"<REDACTED:{name}>" + suffix + buf[e:]

        # Env-file exact-match pass (runs on already-regex-scrubbed buffer).
        if self.secrets_index is not None and len(self.secrets_index) > 0:
            buf, env_count = self.secrets_index.scrub(buf)
            if env_count > 0:
                findings.append(
                    Finding(
                        pattern_name="ENV_FILE",
                        start=-1,
                        end=-1,
                        original_hash=f"env_matches={env_count}",
                        confidence="high",
                    )
                )

        # Re-sort findings in ascending order for nicer reporting.
        findings.sort(key=lambda f: (f.start, f.pattern_name))
        return buf, findings


def scrub(text: str, **kwargs) -> tuple[str, list[Finding]]:
    """Convenience one-shot wrapper: Scrubber(**kwargs).scrub(text)."""
    return Scrubber(**kwargs).scrub(text)
