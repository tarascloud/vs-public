#!/usr/bin/env bash
# scan-prompt-injection.sh — Wrapper for the Python prompt injection scanner.
#
# Usage:
#   bash infra/scripts/scan-prompt-injection.sh [TARGET_DIR]
#
# Pre-commit hook integration:
#   Add to .git/hooks/pre-commit or .husky/pre-commit:
#     bash infra/scripts/scan-prompt-injection.sh "$(git rev-parse --show-toplevel)"
#
# See docs/security/prompt-injection-patterns.md for pattern documentation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 "$SCRIPT_DIR/scan-prompt-injection.py" "$@"
