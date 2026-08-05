#!/usr/bin/env python3
"""MemPalace Quality Evaluation — mp_t12

Reads queries.yaml, runs /search for each query (k=5),
computes Recall@5 and keyword match, outputs a table.

Usage:
    python3 mempalace/eval/run_eval.py [--url URL] [--token TOKEN] [--k K]
    python3 mempalace/eval/run_eval.py --output mempalace/eval/results-20260410.md
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip3 install requests", file=sys.stderr)
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed. Run: pip3 install pyyaml", file=sys.stderr)
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

DEFAULT_URL = "http://127.0.0.1:8031"
QUERIES_FILE = Path(__file__).parent / "queries.yaml"


def _get_token() -> str:
    token = os.environ.get("MEMPALACE_TOKEN") or os.environ.get("MEMPALACE_BEARER_TOKEN")
    if token:
        return token
    secrets_path = Path("/opt/docker/secrets/.mempalace.env")
    if secrets_path.exists():
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("MEMPALACE_BEARER_TOKEN="):
                return line.split("=", 1)[1].strip()
            if line.startswith("MEMPALACE_INGEST_TOKEN="):
                return line.split("=", 1)[1].strip()
    print("ERROR: token not found", file=sys.stderr)
    sys.exit(1)


# ── Search ────────────────────────────────────────────────────────────────────

def do_search(base_url: str, token: str, query: str, k: int, mode: str | None = None) -> list[dict[str, Any]]:
    """Call POST /search and return list of result dicts."""
    payload: dict[str, Any] = {"query": query, "k": k}
    if mode:
        payload["mode"] = mode
    resp = requests.post(
        f"{base_url}/search",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("results", [])


# ── Scoring ───────────────────────────────────────────────────────────────────

def recall_at_k(results: list[dict], expected_sources: list[str]) -> float:
    """Fraction of expected sources found in top-k results (0.0..1.0)."""
    if not expected_sources:
        return 1.0
    found_sources = {r.get("source", "") for r in results}
    matched = sum(1 for s in expected_sources if s in found_sources)
    return matched / len(expected_sources)


def keyword_match(results: list[dict], expected_keywords: list[str]) -> float:
    """Fraction of expected keywords found (case-insensitive) across all result content."""
    if not expected_keywords:
        return 1.0
    combined_text = " ".join(r.get("content", "") for r in results).lower()
    matched = sum(1 for kw in expected_keywords if str(kw).lower() in combined_text)
    return matched / len(expected_keywords)


# ── Format helpers ────────────────────────────────────────────────────────────

def top1_snippet(results: list[dict], max_len: int = 120) -> str:
    if not results:
        return "(no results)"
    content = results[0].get("content", "")
    # Strip HTML comment header if present
    if content.startswith("<!--"):
        end = content.find("-->")
        if end >= 0:
            content = content[end + 3:].strip()
    content = content.replace("\n", " ").strip()
    if len(content) > max_len:
        content = content[:max_len] + "…"
    return content


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="MemPalace quality eval")
    parser.add_argument("--url", default=DEFAULT_URL, help="Base URL of ingest server")
    parser.add_argument("--token", default=None, help="Bearer token (or auto-read from secrets)")
    parser.add_argument("--k", type=int, default=5, help="Top-k results per query")
    parser.add_argument("--mode", default=None, help="Search mode: vector|hybrid|rerank (default: server default)")
    parser.add_argument("--output", default=None, help="Write markdown report to file")
    args = parser.parse_args()

    token = args.token or _get_token()

    # Load queries
    if not QUERIES_FILE.exists():
        print(f"ERROR: {QUERIES_FILE} not found", file=sys.stderr)
        sys.exit(1)
    with QUERIES_FILE.open() as f:
        queries = yaml.safe_load(f)

    print(f"MemPalace Quality Eval — {len(queries)} queries, k={args.k}")
    print(f"Server: {args.url}\n")

    # Check total docs
    try:
        health = requests.get(f"{args.url}/health", timeout=5).json()
        palace_ok = health.get("palace_exists", "?")
        print(f"Palace exists: {palace_ok}")
    except Exception as e:
        print(f"WARNING: health check failed: {e}")

    rows: list[dict] = []
    all_recall: list[float] = []
    all_kwmatch: list[float] = []
    all_latency_ms: list[float] = []

    for q in queries:
        qid = q["id"]
        query_text = q["query"]
        expected_sources = q.get("expected_sources", [])
        expected_keywords = q.get("expected_keywords", [])

        t0 = time.perf_counter()
        try:
            results = do_search(args.url, token, query_text, args.k, mode=args.mode)
        except Exception as e:
            print(f"ERROR on {qid}: {e}", file=sys.stderr)
            results = []
        latency_ms = (time.perf_counter() - t0) * 1000.0
        all_latency_ms.append(latency_ms)

        rec = recall_at_k(results, expected_sources)
        kwm = keyword_match(results, expected_keywords)
        snippet = top1_snippet(results)
        top_sources = [r.get("source", "?") for r in results[:3]]

        all_recall.append(rec)
        all_kwmatch.append(kwm)

        rows.append({
            "id": qid,
            "query": query_text,
            "recall": rec,
            "kw_match": kwm,
            "top1_snippet": snippet,
            "top_sources": top_sources,
            "n_results": len(results),
            "latency_ms": latency_ms,
        })

        status_icon = "OK" if rec >= 0.6 else ("WARN" if rec > 0 else "FAIL")
        print(f"[{status_icon}] {qid}: recall={rec:.2f} kw={kwm:.2f} lat={latency_ms:.0f}ms sources={top_sources}")
        print(f"       snippet: {snippet[:100]}")

    avg_recall = sum(all_recall) / len(all_recall) if all_recall else 0.0
    avg_kwmatch = sum(all_kwmatch) / len(all_kwmatch) if all_kwmatch else 0.0

    sorted_lat = sorted(all_latency_ms) if all_latency_ms else [0.0]
    p50 = sorted_lat[len(sorted_lat) // 2]
    p95 = sorted_lat[max(0, int(round(len(sorted_lat) * 0.95)) - 1)]
    avg_lat = sum(all_latency_ms) / len(all_latency_ms) if all_latency_ms else 0.0

    print(f"\n{'='*60}")
    print(f"AVG Recall@{args.k}: {avg_recall:.2f} ({avg_recall*100:.1f}%)")
    print(f"AVG Keyword Match: {avg_kwmatch:.2f} ({avg_kwmatch*100:.1f}%)")
    print(f"Latency: avg={avg_lat:.0f}ms  p50={p50:.0f}ms  p95={p95:.0f}ms")
    overall_status = "PASS (≥70%)" if avg_recall >= 0.7 else ("OK (≥60%)" if avg_recall >= 0.6 else "WARNING — recall < 60%")
    print(f"Overall: {overall_status}")

    worst = sorted(rows, key=lambda r: r["recall"])[:2]
    print(f"\nWorst queries:")
    for w in worst:
        print(f"  {w['id']}: recall={w['recall']:.2f} kw={w['kw_match']:.2f} — {w['query'][:70]}")

    # Markdown report
    if args.output:
        _write_markdown(args.output, rows, avg_recall, avg_kwmatch, args.k, overall_status, worst, avg_lat, p50, p95)
        print(f"\nReport written to: {args.output}")


def _write_markdown(
    path: str,
    rows: list[dict],
    avg_recall: float,
    avg_kwmatch: float,
    k: int,
    overall_status: str,
    worst: list[dict],
    avg_lat: float = 0.0,
    p50: float = 0.0,
    p95: float = 0.0,
) -> None:
    from datetime import date
    lines = [
        "# MemPalace Quality Eval",
        "",
        f"**Date:** {date.today().isoformat()}  ",
        f"**Queries:** {len(rows)}  ",
        f"**k:** {k}  ",
        "",
        "## Summary",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| AVG Recall@{k} | {avg_recall:.2f} ({avg_recall*100:.1f}%) |",
        f"| AVG Keyword Match | {avg_kwmatch:.2f} ({avg_kwmatch*100:.1f}%) |",
        f"| Avg Latency | {avg_lat:.0f}ms |",
        f"| p50 Latency | {p50:.0f}ms |",
        f"| p95 Latency | {p95:.0f}ms |",
        f"| Status | **{overall_status}** |",
        "",
        "## Results",
        "",
        f"| ID | Query | Recall@{k} | KW Match | Latency | Top-1 Snippet | Top Sources |",
        f"|----|-------|-----------|----------|---------|---------------|-------------|",
    ]

    for r in rows:
        status = "" if r["recall"] >= 0.6 else " WARN"
        snippet_md = r["top1_snippet"].replace("|", "\\|")[:100]
        sources_str = ", ".join(r["top_sources"])
        lat = r.get("latency_ms", 0.0)
        lines.append(
            f"| {r['id']}{status} | {r['query'][:50]} | {r['recall']:.2f} | {r['kw_match']:.2f} | {lat:.0f}ms | {snippet_md} | {sources_str} |"
        )

    lines += [
        "",
        "## Worst Queries",
        "",
    ]
    for w in worst:
        lines.append(f"- **{w['id']}** (recall={w['recall']:.2f}): {w['query']}")

    lines += [
        "",
        "## Analysis & Recommendations",
        "",
    ]

    if avg_recall < 0.6:
        lines += [
            "WARNING: avg Recall@5 < 60%. Recommended improvements:",
            "",
            "1. **More data** — run full ingest without --limit to populate palace with all available content",
            "2. **Chunk size tuning** — current chunks may be too large; split into ~512 token chunks",
            "3. **Embedding model** — consider switching from default ChromaDB embedding to `all-MiniLM-L6-v2` or `multilingual-e5-small` for better UA/EN mixing",
            "4. **Source diversity** — vs-tasks and vs-initiatives are underrepresented (1 doc each at baseline)",
        ]
    else:
        lines += [
            "Recall@5 >= 60% — baseline quality acceptable.",
            "",
            "Potential improvements:",
            "1. Add more structured data from vs-tasks (currently limited ingestion)",
            "2. Consider multilingual embedding model for better Ukrainian query handling",
        ]

    Path(path).write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
