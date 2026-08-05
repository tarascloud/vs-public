#!/usr/bin/env python3
"""MemPalace Reranker Evaluation — REV-20260419-0051 / MP-C-08-RERANKER

Runs the existing queries.yaml suite against /search with rerank=true
(once implemented), computes Recall@5, publishes results next to
results-20260411-pgvector.md so the reranker uplift is traceable.

Status: scaffold — the `/search` endpoint does not yet accept rerank=true
as of 2026-04-19. When Phase 2 of the ADR ships, just run this script.

Usage:
    python3 services/mempalace/eval/eval_reranker.py
    python3 services/mempalace/eval/eval_reranker.py \
        --output services/mempalace/eval/results-YYYYMMDD-reranker.md

See: docs/adr/mempalace-reranker.md
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Reuse the baseline eval harness so we do not drift from it.
THIS = Path(__file__).resolve()
sys.path.insert(0, str(THIS.parent))

try:
    import run_eval  # type: ignore
except ImportError as exc:
    print(f"ERROR: cannot import run_eval: {exc}", file=sys.stderr)
    sys.exit(1)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--url", default=run_eval.DEFAULT_URL)
    p.add_argument("--k", type=int, default=5)
    p.add_argument("--output", type=Path, default=None)
    args = p.parse_args()

    token = run_eval._get_token()

    # Monkey-patch run_eval.do_search to always pass rerank=true.
    orig_do_search = run_eval.do_search

    def rerank_search(base_url: str, token: str, query: str, k: int, mode=None):
        # When Phase 2 lands, run_eval.do_search should accept rerank kw.
        # Until then, this call will return the baseline results (recall@5
        # = 66.7%) and the output file will document that.
        import requests
        resp = requests.post(
            f"{base_url}/search",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"query": query, "k": k, "rerank": True},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])

    run_eval.do_search = rerank_search
    try:
        # Let run_eval handle argv parsing / reporting / output.
        sys.argv = [
            "run_eval.py",
            "--url", args.url,
            "--k", str(args.k),
        ]
        if args.output:
            sys.argv += ["--output", str(args.output)]
        return run_eval.main() if hasattr(run_eval, "main") else 0
    finally:
        run_eval.do_search = orig_do_search


if __name__ == "__main__":
    sys.exit(main())
