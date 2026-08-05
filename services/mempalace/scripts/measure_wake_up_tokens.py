#!/usr/bin/env python3
"""
Measure the actual token cost of the MemPalace "wake-up" payload.

Background
----------
CLAUDE.md, agents/ai.md, and docs/adr/mempalace.md all claim
`mempalace_wake_up returns ~170 tokens L0+L1 identity`. Investigation
(AI-20260601-0007) showed:

1. There is no `mempalace_wake_up` MCP tool — never has been. The
   protocol bullet says "ON WAKE-UP: Call mempalace_status".
2. `mempalace_status` returns AAAK_SPEC + PALACE_PROTOCOL + palace
   overview (wings/rooms/counts) — likely well above 170 tokens.

This script measures the actual `tool_status()` JSON payload in tokens
using tiktoken with both the cl100k_base (GPT-4 / Claude approximation)
and o200k_base (newer Claude/GPT-4o) encodings, so we can update the
docs with the real number.

Usage
-----
    # On VPS (where mempalace container is running):
    python3 services/mempalace/scripts/measure_wake_up_tokens.py

    # Or via docker exec:
    docker cp services/mempalace/scripts/measure_wake_up_tokens.py mempalace:/tmp/
    docker exec mempalace python3 /tmp/measure_wake_up_tokens.py

Output
------
JSON line on stdout with:
- bytes_status: raw byte length of the status payload
- tokens_cl100k: token count under cl100k_base encoding
- tokens_o200k: token count under o200k_base encoding (newer models)
- protocol_tokens / aaak_tokens / counts_tokens: per-section breakdown
- recommendation: whether the payload should be slimmed (>500 tokens)

The wake-up payload is the union of:
- mempalace_status() output (counts + AAAK_SPEC + PALACE_PROTOCOL)

A "true" wake-up tool would typically return just the L0+L1 identity
strings; this script measures what the user actually sees when their
agent calls the documented wake-up entry point.
"""
from __future__ import annotations

import json
import sys
from typing import Any

# tiktoken is an optional dependency for the mempalace container; install
# with `pip install tiktoken` if missing. We import lazily so the script
# can still report byte counts without it.
try:
    import tiktoken
    HAS_TIKTOKEN = True
except ImportError:
    HAS_TIKTOKEN = False


def _count_tokens(s: str, encoding_name: str) -> int | None:
    """Return tiktoken count or None if tiktoken not available."""
    if not HAS_TIKTOKEN:
        return None
    try:
        enc = tiktoken.get_encoding(encoding_name)
        return len(enc.encode(s))
    except Exception as e:  # pragma: no cover
        print(f"[warn] tiktoken {encoding_name} failed: {e}", file=sys.stderr)
        return None


def measure(payload: dict[str, Any]) -> dict[str, Any]:
    serialized = json.dumps(payload, ensure_ascii=False)
    aaak = payload.get("aaak_dialect", "")
    protocol = payload.get("protocol", "")
    # Counts section = payload minus the large text blobs
    counts_only = {k: v for k, v in payload.items() if k not in ("aaak_dialect", "protocol")}
    counts_str = json.dumps(counts_only, ensure_ascii=False)

    return {
        "bytes_status": len(serialized.encode("utf-8")),
        "tokens_cl100k": _count_tokens(serialized, "cl100k_base"),
        "tokens_o200k": _count_tokens(serialized, "o200k_base"),
        "aaak_tokens_cl100k": _count_tokens(aaak, "cl100k_base"),
        "protocol_tokens_cl100k": _count_tokens(protocol, "cl100k_base"),
        "counts_tokens_cl100k": _count_tokens(counts_str, "cl100k_base"),
        "tiktoken_available": HAS_TIKTOKEN,
    }


def main() -> int:
    # Import lazily so the script can be inspected without the mempalace
    # package on the path.
    try:
        from mempalace import mcp_server  # type: ignore
    except ImportError as e:
        print(json.dumps({
            "error": f"mempalace package not importable: {e}",
            "hint": "Run inside the mempalace container: docker exec mempalace python3 ..."
        }), file=sys.stderr)
        return 2

    try:
        payload = mcp_server.tool_status()
    except Exception as e:
        print(json.dumps({"error": f"tool_status() failed: {e}"}), file=sys.stderr)
        return 3

    result = measure(payload)
    result["recommendation"] = (
        "slim_down"
        if (result.get("tokens_cl100k") or 0) > 500
        else "ok"
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
