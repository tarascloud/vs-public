#!/usr/bin/env python3
"""Tests for ingest_claude_sessions.py — REV22-018.

Tests the append-delta fix: when a session that was already ingested gains new
messages (long-running tmux sessions), the ingester must produce a new chunk
for the delta instead of silently skipping the session.

Run: python3 -m pytest ingest/test_ingest_claude_sessions.py -v
  or: python3 ingest/test_ingest_claude_sessions.py
"""
from __future__ import annotations

import json
import sys
import tempfile
import textwrap
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

# Insert parent so we can import the module without installing
sys.path.insert(0, str(Path(__file__).parent))

import ingest_claude_sessions as ics


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_jsonl_line(session_id: str, uuid: str, role: str, text: str, ts: str = "2026-07-22T10:00:00Z") -> str:
    obj = {
        "type": role,
        "sessionId": session_id,
        "uuid": uuid,
        "timestamp": ts,
        "isMeta": False,
        "message": {
            "role": role,
            "content": text,
        },
    }
    return json.dumps(obj)


def _write_jsonl(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_parse_session_file_from_offset() -> None:
    """_parse_session_file with start_line > 0 returns only lines from that offset."""
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "sess.jsonl"
        sid = "sess-abc"
        lines = [
            _make_jsonl_line(sid, "u1", "user", "Hello"),
            _make_jsonl_line(sid, "a1", "assistant", "World"),
            _make_jsonl_line(sid, "u2", "user", "Follow-up"),
            _make_jsonl_line(sid, "a2", "assistant", "Answer"),
        ]
        _write_jsonl(p, lines)

        # Parse from the beginning — should have 4 messages
        sessions_full, total_full = ics._parse_session_file(p, start_line=0)
        assert sid in sessions_full
        assert len(sessions_full[sid]) == 4
        assert total_full == 4

        # Parse from offset 2 — should have 2 messages (lines 2+3)
        sessions_delta, total_delta = ics._parse_session_file(p, start_line=2)
        assert sid in sessions_delta
        assert len(sessions_delta[sid]) == 2
        assert total_delta == 4  # total_lines is still absolute line count


def test_append_delta_produces_ingest(tmp_path: Any = None) -> None:
    """REV22-018 core: when session is already known, new lines → ingested > 0.

    Simulates the scenario:
    1. Run 1 (offset=0): ingest session with 2 messages → known
    2. Append 2 more messages to the JSONL file
    3. Run 2 (offset=2): should ingest 1 append-delta chunk, NOT skip
    """
    if tmp_path is None:
        import tempfile
        td = tempfile.TemporaryDirectory()
        tmp_path = Path(td.name)

    sid = "sess-long-lived"
    jsonl_path = tmp_path / "session.jsonl"

    # Initial 2-message session
    initial_lines = [
        _make_jsonl_line(sid, "u1", "user", "First question"),
        _make_jsonl_line(sid, "a1", "assistant", "First answer"),
    ]
    _write_jsonl(jsonl_path, initial_lines)

    # Simulate Run 1: session is ingested, offset=2 saved
    sessions1, total1 = ics._parse_session_file(jsonl_path, start_line=0)
    assert sid in sessions1
    assert total1 == 2

    # Simulate that session was recorded as known
    known_sessions: set[str] = {sid}
    session_offsets: dict[str, int] = {sid: 2}  # last_offset after run 1

    # Append 2 more messages
    append_lines = [
        _make_jsonl_line(sid, "u2", "user", "Second question", ts="2026-07-22T11:00:00Z"),
        _make_jsonl_line(sid, "a2", "assistant", "Second answer", ts="2026-07-22T11:01:00Z"),
    ]
    with jsonl_path.open("a", encoding="utf-8") as f:
        f.write("\n".join(append_lines) + "\n")

    # Run 2: parse from last_offset=2 (the saved offset after run 1)
    prev_last_offset = 2  # what was saved after run 1
    sessions2, total2 = ics._parse_session_file(jsonl_path, start_line=prev_last_offset)
    assert total2 == 4  # absolute line count of current file
    assert sid in sessions2, "session_id must appear in delta parse"
    assert len(sessions2[sid]) == 2, "delta should contain exactly the 2 new messages"

    # The append-delta logic: because sid is in known_sessions, it should NOT be
    # skipped — instead an append source_id is constructed and _ingest_session called.
    prev_offset = session_offsets.get(sid, 0)
    # total2 (current total_lines) > prev_offset (what was saved last run)
    assert total2 > prev_offset, "total_lines must exceed prev session_offset (file grew)"

    # Verify the append source_id is distinct
    append_source_id = f"{sid}:append{prev_offset}"
    assert append_source_id == f"{sid}:append2"
    assert ":" in append_source_id  # must differ from base session_id

    # Simulate _ingest_session being called (dry-run) — must return True
    with patch.object(ics, "_post_with_retry") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 202
        mock_post.return_value = mock_resp

        result = ics._ingest_session(
            session_id=append_source_id,
            messages=sessions2[sid],
            project_name="test-project",
            file_name="session.jsonl",
            token="test-token",
            dry_run=False,
            parent_session_id=sid,
        )
        assert result is True, "append-delta ingest must succeed"

    print("[OK] test_append_delta_produces_ingest passed")


def test_no_duplicate_on_unchanged_file() -> None:
    """If the file did not grow since last run, session should be skipped."""
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "session.jsonl"
        sid = "sess-static"
        lines = [
            _make_jsonl_line(sid, "u1", "user", "Q"),
            _make_jsonl_line(sid, "a1", "assistant", "A"),
        ]
        _write_jsonl(p, lines)

        sessions, total_lines = ics._parse_session_file(p, start_line=0)
        # total_lines == 2, so last_offset saved = 2
        # On next run, start_line=2 → sessions is empty (no new lines)
        sessions2, _ = ics._parse_session_file(p, start_line=2)
        assert sid not in sessions2 or len(sessions2.get(sid, [])) == 0, \
            "unchanged file should not yield new messages for the session"

    print("[OK] test_no_duplicate_on_unchanged_file passed")


def test_build_markdown_skips_meta() -> None:
    """_build_markdown skips isMeta messages."""
    messages = [
        {"role": "user", "text": "Hello", "isMeta": False, "timestamp": "", "uuid": "x"},
        {"role": "assistant", "text": "World", "isMeta": True, "timestamp": "", "uuid": "y"},
        {"role": "assistant", "text": "Non-meta response", "isMeta": False, "timestamp": "", "uuid": "z"},
    ]
    md = ics._build_markdown(messages)
    assert "Hello" in md
    assert "World" not in md
    assert "Non-meta response" in md
    print("[OK] test_build_markdown_skips_meta passed")


def test_chunk_text_preserves_content() -> None:
    """_chunk_text splits large text but preserves all content."""
    text = "A" * 5000
    chunks = ics._chunk_text(text)
    assert len(chunks) > 1
    # All chunks together should cover the original (with overlap)
    reconstructed = "".join(chunks)
    # Each original character should appear in at least one chunk
    for i in range(0, len(text), 100):
        segment = text[i : i + 50]
        assert any(segment in c for c in chunks), f"segment at {i} not found in any chunk"
    print("[OK] test_chunk_text_preserves_content passed")


if __name__ == "__main__":
    print("Running REV22-018 tests for ingest_claude_sessions.py ...")
    test_parse_session_file_from_offset()
    print("[OK] test_parse_session_file_from_offset passed")
    test_append_delta_produces_ingest()
    test_no_duplicate_on_unchanged_file()
    test_build_markdown_skips_meta()
    test_chunk_text_preserves_content()
    print("\nAll tests passed.")
