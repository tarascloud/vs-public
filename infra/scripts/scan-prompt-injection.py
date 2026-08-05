#!/usr/bin/env python3
"""Scan context files for prompt injection patterns.

Usage:
    python3 infra/scripts/scan-prompt-injection.py [TARGET_DIR]

TARGET_DIR defaults to the current directory. Scans:
  - agents/*.md
  - CLAUDE.md (in target or parent dir)
  - .claude/rules/*.md
  - docs/**/*.md
  - content/**/*.md

Exit codes:
  0 — no injections found (clean)
  1 — potential prompt injection detected
  2 — usage error

Pre-commit hook integration:
  Add to .git/hooks/pre-commit or .husky/pre-commit:
    python3 infra/scripts/scan-prompt-injection.py "$(git rev-parse --show-toplevel)"

Inspired by NousResearch Hermes Agent threat patterns.
See docs/security/prompt-injection-patterns.md for pattern documentation.
"""

import re
import sys
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Optional


@dataclass
class Finding:
    file: str
    line_num: int
    severity: str  # HIGH, MEDIUM, LOW
    category: str
    pattern_desc: str
    line_content: str


@dataclass
class Pattern:
    regex: re.Pattern[str]
    severity: str
    category: str
    description: str
    skip_agent_files: bool = False
    skip_file_patterns: tuple[str, ...] = ()


# ============================================================
# PATTERN DEFINITIONS
# ============================================================

PATTERNS: list[Pattern] = [
    # --- HIGH: System prompt override ---
    Pattern(
        regex=re.compile(
            r'ignore\s+(?:all\s+|any\s+)?'
            r'(?:previous|above|prior|these|the|my|your)?\s*'
            r'(instructions|rules|prompts|constraints|guidelines)',
            re.IGNORECASE,
        ),
        severity="HIGH",
        category="system-prompt-override",
        description="ignore {qualifier} instructions/rules/prompts",
    ),
    Pattern(
        regex=re.compile(
            r'disregard\s+(?:all\s+|any\s+)?'
            r'(?:previous|above|prior|the|your)?\s*'
            r'(instructions|rules|prompts|constraints|guidelines)',
            re.IGNORECASE,
        ),
        severity="HIGH",
        category="system-prompt-override",
        description="disregard instructions",
    ),
    Pattern(
        regex=re.compile(r'\byou are now\b', re.IGNORECASE),
        severity="HIGH",
        category="system-prompt-override",
        description="you are now",
        skip_agent_files=True,
    ),
    Pattern(
        regex=re.compile(
            r'\bnew\s+(instructions|system\s*prompt|directive)\s*[:.]',
            re.IGNORECASE,
        ),
        severity="HIGH",
        category="system-prompt-override",
        description="new instructions/system prompt",
    ),
    Pattern(
        regex=re.compile(
            r'\boverride\s+(?:all\s+|your\s+|the\s+|previous\s+|above\s+)?'
            r'(instructions|rules|prompts|constraints)',
            re.IGNORECASE,
        ),
        severity="HIGH",
        category="system-prompt-override",
        description="override instructions",
    ),
    Pattern(
        regex=re.compile(
            r'\bdo\s+not\s+follow\s+(?:the\s+|any\s+|your\s+|previous\s+|above\s+)?'
            r'(rules|instructions|guidelines|prompts)',
            re.IGNORECASE,
        ),
        severity="HIGH",
        category="system-prompt-override",
        description="do not follow rules/instructions",
    ),

    # --- HIGH: Delimiter injection ---
    Pattern(
        regex=re.compile(
            r'</system>|<\|im_end\|>|<\|im_start\|>|\[INST\]|\[/INST\]'
            r'|<<SYS>>|<</SYS>>|<\|endoftext\|>|<\|assistant\|>|<\|user\|>'
        ),
        severity="HIGH",
        category="delimiter-injection",
        description="chat template delimiter token",
        skip_file_patterns=("prompt-injection-patterns.md", "scan-prompt-injection"),
    ),

    # --- MEDIUM: Role hijack ---
    Pattern(
        regex=re.compile(r'\bpretend\s+(to\s+be|you\s+are|you.re)\b', re.IGNORECASE),
        severity="MEDIUM",
        category="role-hijack",
        description="pretend to be/you are",
        skip_agent_files=True,
    ),
    Pattern(
        regex=re.compile(r'\bact\s+as\s+(a|an|the|if)\b', re.IGNORECASE),
        severity="MEDIUM",
        category="role-hijack",
        description="act as",
        skip_agent_files=True,
    ),

    # --- MEDIUM: Data exfiltration ---
    Pattern(
        regex=re.compile(
            r'\b(output|print|display|show|reveal|repeat|dump)\s+(all\s+)?'
            r'(the\s+)?(system\s*)?(instructions|rules|prompt|context|configuration)\b',
            re.IGNORECASE,
        ),
        severity="MEDIUM",
        category="data-exfiltration",
        description="output/reveal instructions/prompt",
    ),
    Pattern(
        regex=re.compile(r'\breveal\s+your\b', re.IGNORECASE),
        severity="MEDIUM",
        category="data-exfiltration",
        description="reveal your",
    ),
    Pattern(
        regex=re.compile(
            r'\bshow\s+me\s+your\s+(prompt|instructions|system|rules|config)\b',
            re.IGNORECASE,
        ),
        severity="MEDIUM",
        category="data-exfiltration",
        description="show me your prompt/instructions",
    ),

    # --- MEDIUM: Encoding bypass ---
    Pattern(
        regex=re.compile(
            r'\b(encode|decode|convert|translate)\s+(this|it|the|that|output|response|everything)\s+'
            r'(to|into|using|in|as)\s+(base64|rot13|hex|binary|morse)\b',
            re.IGNORECASE,
        ),
        severity="MEDIUM",
        category="encoding-bypass",
        description="encode/convert to base64/rot13/hex",
    ),

    # --- MEDIUM: Memory/context manipulation ---
    Pattern(
        regex=re.compile(
            r'\bforget\s+(everything|all|your|the|previous)\b',
            re.IGNORECASE,
        ),
        severity="MEDIUM",
        category="system-prompt-override",
        description="forget everything/all/your",
    ),

    # --- MEDIUM: Suspicious keywords ---
    Pattern(
        regex=re.compile(r'\bjailbreak\b', re.IGNORECASE),
        severity="MEDIUM",
        category="suspicious-keyword",
        description="jailbreak",
        skip_file_patterns=("security", "prompt-injection"),
    ),
    Pattern(
        regex=re.compile(r'\bDAN\b.*\b(mode|prompt|you|now)\b'),
        severity="MEDIUM",
        category="suspicious-keyword",
        description="DAN mode reference",
    ),

    # --- LOW: Behavior override ---
    Pattern(
        regex=re.compile(
            r'\bfrom\s+now\s+on\b.*\b(you|always|never|must|respond|answer|only)\b',
            re.IGNORECASE,
        ),
        severity="LOW",
        category="behavior-override",
        description="from now on + directive",
        skip_agent_files=True,
    ),
]


def collect_files(target_dir: Path) -> list[Path]:
    """Collect all context files to scan."""
    files: list[Path] = []

    # agents/*.md
    agents_dir = target_dir / "agents"
    if agents_dir.is_dir():
        files.extend(agents_dir.glob("*.md"))
        # Also check subdirectories for agent prompt files
        for subdir in agents_dir.iterdir():
            if subdir.is_dir():
                files.extend(subdir.glob("*.md"))

    # CLAUDE.md
    for candidate in [target_dir / "CLAUDE.md", target_dir.parent / "CLAUDE.md"]:
        if candidate.is_file():
            files.append(candidate.resolve())

    # .claude/rules/*.md
    rules_dir = target_dir / ".claude" / "rules"
    if rules_dir.is_dir():
        files.extend(rules_dir.glob("*.md"))

    # docs/**/*.md
    docs_dir = target_dir / "docs"
    if docs_dir.is_dir():
        files.extend(docs_dir.rglob("*.md"))

    # content/**/*.md
    content_dir = target_dir / "content"
    if content_dir.is_dir():
        files.extend(content_dir.rglob("*.md"))

    # Deduplicate
    seen: set[Path] = set()
    unique: list[Path] = []
    for f in files:
        resolved = f.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique.append(resolved)

    return unique


def is_agent_file(filepath: Path) -> bool:
    """Check if a file is an agent definition (whitelist for role patterns)."""
    parts = filepath.parts
    return "agents" in parts


def should_skip_file(filepath: Path, pattern: Pattern) -> bool:
    """Check if this pattern should be skipped for this file."""
    filepath_str = str(filepath)
    for skip_pattern in pattern.skip_file_patterns:
        if skip_pattern in filepath_str:
            return True
    return False


def scan_file(filepath: Path, target_dir: Path) -> list[Finding]:
    """Scan a single file for injection patterns."""
    findings: list[Finding] = []
    agent_file = is_agent_file(filepath)

    try:
        content = filepath.read_text(encoding="utf-8", errors="replace")
    except (OSError, PermissionError) as e:
        print(f"WARNING: Cannot read {filepath}: {e}", file=sys.stderr)
        return findings

    lines = content.splitlines()

    for line_num_0, line in enumerate(lines):
        if not line.strip():
            continue

        for pattern in PATTERNS:
            # Skip agent-whitelisted patterns in agent files
            if pattern.skip_agent_files and agent_file:
                continue

            # Skip file-pattern whitelisted files
            if should_skip_file(filepath, pattern):
                continue

            if pattern.regex.search(line):
                findings.append(Finding(
                    file=str(filepath),
                    line_num=line_num_0 + 1,
                    severity=pattern.severity,
                    category=pattern.category,
                    pattern_desc=pattern.description,
                    line_content=line.strip(),
                ))

    return findings


def format_finding(finding: Finding, target_dir: Path) -> str:
    """Format a finding for display."""
    # Make path relative to target dir if possible
    try:
        rel_path = Path(finding.file).relative_to(target_dir)
    except ValueError:
        rel_path = Path(finding.file)

    severity_colors = {
        "HIGH": "\033[0;31m",    # red
        "MEDIUM": "\033[0;33m",  # yellow
        "LOW": "\033[0;36m",     # cyan
    }
    reset = "\033[0m"
    bold = "\033[1m"

    is_tty = sys.stdout.isatty()
    if not is_tty:
        severity_colors = {"HIGH": "", "MEDIUM": "", "LOW": ""}
        reset = ""
        bold = ""

    color = severity_colors.get(finding.severity, "")

    return (
        f"{bold}{rel_path}:{finding.line_num}{reset} "
        f"[{color}{finding.severity}{reset}] "
        f"{finding.category} -- pattern: {finding.pattern_desc}\n"
        f"  {finding.line_content}\n"
    )


def main() -> int:
    if len(sys.argv) > 2:
        print("Usage: scan-prompt-injection.py [TARGET_DIR]", file=sys.stderr)
        return 2

    target_dir = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

    if not target_dir.is_dir():
        print(f"ERROR: Directory not found: {target_dir}", file=sys.stderr)
        return 2

    files = collect_files(target_dir)

    if not files:
        print(f"No context files found in {target_dir}")
        return 0

    print(f"Scanning {len(files)} context files in {target_dir}...\n")

    all_findings: list[Finding] = []
    for filepath in sorted(files):
        findings = scan_file(filepath, target_dir)
        all_findings.extend(findings)

    # Sort by severity (HIGH first), then file, then line
    severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    all_findings.sort(key=lambda f: (severity_order.get(f.severity, 9), f.file, f.line_num))

    for finding in all_findings:
        print(format_finding(finding, target_dir))

    print("---")
    if not all_findings:
        print("CLEAN: No prompt injection patterns detected.")
        return 0
    else:
        high = sum(1 for f in all_findings if f.severity == "HIGH")
        medium = sum(1 for f in all_findings if f.severity == "MEDIUM")
        low = sum(1 for f in all_findings if f.severity == "LOW")
        print(
            f"ALERT: {len(all_findings)} potential prompt injection pattern(s) detected "
            f"(HIGH: {high}, MEDIUM: {medium}, LOW: {low})."
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
