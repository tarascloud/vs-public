"""Finding dataclass — one entry per detected secret occurrence."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class Finding:
    pattern_name: str
    start: int
    end: int
    original_hash: str  # sha256 of the original matched bytes (for audit without leaking)
    confidence: str  # high | medium | low

    @classmethod
    def from_match(cls, pattern_name: str, start: int, end: int,
                   original: str, confidence: str) -> "Finding":
        h = hashlib.sha256(original.encode("utf-8")).hexdigest()[:16]
        return cls(
            pattern_name=pattern_name,
            start=start,
            end=end,
            original_hash=h,
            confidence=confidence,
        )
