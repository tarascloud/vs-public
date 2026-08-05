#!/usr/bin/env python3
"""wiki-link-lint.py — REV22-053

Checks all relative links in agents/*/wiki/**/*.md and reports
broken ones (target file does not exist).

Usage:
    python3 scripts/wiki-link-lint.py [--repo-root PATH] [--exit-on-error]

Exit codes:
    0 — no broken links
    1 — broken links found (only when --exit-on-error is passed)

Integrate in nightly QA:
    0 5 * * * python3 /opt/repos/vibe-studio/scripts/wiki-link-lint.py \
        --repo-root /opt/repos/vibe-studio --exit-on-error \
        >> /opt/docker/logs/wiki-link-lint.log 2>&1
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Matches Markdown links: [text](path) — captures the path part
# Ignores http:// and https:// links (external URLs)
_MD_LINK_RE = re.compile(r'\[([^\]]*)\]\((?!https?://)([^)]+)\)')

# Matches Markdown image links: ![alt](path)
_IMG_LINK_RE = re.compile(r'!\[([^\]]*)\]\((?!https?://)([^)]+)\)')


def _resolve_link(source_file: Path, raw_target: str) -> Path | None:
    """Resolve a relative markdown link to an absolute path.

    Returns the resolved Path, or None if the target is empty / anchor-only.
    """
    # Strip anchors (#section)
    if "#" in raw_target:
        raw_target = raw_target.split("#")[0]
    raw_target = raw_target.strip()
    if not raw_target:
        return None

    target = (source_file.parent / raw_target).resolve()
    return target


def lint_file(md_file: Path, repo_root: Path) -> list[dict]:
    """Return list of broken-link findings for one markdown file."""
    findings: list[dict] = []
    try:
        text = md_file.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return [{"file": str(md_file), "line": 0, "link": "", "error": f"read error: {e}"}]

    for lineno, line in enumerate(text.splitlines(), start=1):
        for pattern in (_MD_LINK_RE, _IMG_LINK_RE):
            for match in pattern.finditer(line):
                raw_target = match.group(2)
                target = _resolve_link(md_file, raw_target)
                if target is None:
                    continue
                if not target.exists():
                    findings.append({
                        "file": str(md_file.relative_to(repo_root)),
                        "line": lineno,
                        "link": raw_target,
                        "resolved": str(target),
                    })
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint relative links in agent wikis")
    parser.add_argument(
        "--repo-root",
        type=str,
        default="",
        help="Path to vs-private repo root (default: auto-detect from script location)",
    )
    parser.add_argument(
        "--exit-on-error",
        action="store_true",
        help="Exit with code 1 if any broken links are found",
    )
    parser.add_argument(
        "--glob",
        type=str,
        default="agents/*/wiki/**/*.md",
        help="Glob pattern relative to repo-root (default: agents/*/wiki/**/*.md)",
    )
    args = parser.parse_args()

    if args.repo_root:
        repo_root = Path(args.repo_root).resolve()
    else:
        # Auto-detect: script is at scripts/wiki-link-lint.py
        repo_root = Path(__file__).resolve().parent.parent

    if not repo_root.is_dir():
        print(f"[ERROR] repo-root not found: {repo_root}", file=sys.stderr)
        return 2

    md_files = sorted(repo_root.glob(args.glob))
    if not md_files:
        print(f"[WARN] No markdown files found for glob: {repo_root}/{args.glob}", file=sys.stderr)
        return 0

    all_findings: list[dict] = []
    for md_file in md_files:
        findings = lint_file(md_file, repo_root)
        all_findings.extend(findings)

    date_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if all_findings:
        print(f"[{date_str}] BROKEN LINKS FOUND: {len(all_findings)}")
        for f in all_findings:
            if "error" in f:
                print(f"  [ERROR] {f['file']}: {f['error']}")
            else:
                print(f"  {f['file']}:{f['line']}: broken link → {f['link']!r}")
        if args.exit_on_error:
            return 1
    else:
        print(f"[{date_str}] OK — {len(md_files)} wiki files scanned, 0 broken links")

    return 0


if __name__ == "__main__":
    sys.exit(main())
