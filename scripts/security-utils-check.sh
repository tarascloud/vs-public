#!/usr/bin/env bash
#
# security-utils-check.sh — contract check: canon security utils vs copies.
#
# Canon lives in packages/security/src/*.ts. Until the package is
# published/consumed everywhere (docs/adr/shared-security-utils.md),
# each repo keeps a local copy. This script detects drift between the canon
# and the copies, comparing CODE ONLY (comment lines and blank lines are
# stripped first, so doc-header differences do not count as drift).
#
# Tiers:
#   STRICT  — copies MUST match canon. Any diff => exit 1 with the diff shown.
#   TRACK   — known project-divergent copies (sanitize-html has per-project
#             profiles, auth-helpers differ by auth stack, rate-limit by
#             backend). Diff => warning only. When a file converges, move its
#             pairs from TRACK to STRICT.
#   Missing copy (either tier) => warning (repo may not be checked out).
#
# Usage:
#   bash scripts/security-utils-check.sh
#     (run from anywhere; repo root is resolved relative to this script —
#      expects sibling checkouts: vibe-studio/{vs-private,pd-private,jf-private,sh-private})
#
# CI integration: NOT wired yet (intentionally). When ready, add a job that
# checks out the four repos side by side and runs this script; non-zero exit
# fails the pipeline. Until then run it manually during security reviews and
# before editing any file listed below.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Override with TARAS_CODE_ROOT when running from a git worktree.
ROOT="${TARAS_CODE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"   # vibe-studio/

FAIL=0
WARN=0

# Strip comments and blank lines so only code is compared.
norm() {
  grep -vE '^\s*(\*|//|/\*)' "$1" | grep -v '^\s*$'
}

check_pair() {
  local tier="$1" canon="$2" copy="$3"
  if [ ! -f "$ROOT/$canon" ]; then
    echo "WARN  missing canon: $canon"
    WARN=$((WARN + 1))
    return
  fi
  if [ ! -f "$ROOT/$copy" ]; then
    echo "WARN  missing copy:  $copy"
    WARN=$((WARN + 1))
    return
  fi
  if diff -q <(norm "$ROOT/$canon") <(norm "$ROOT/$copy") >/dev/null; then
    echo "OK    [$tier] $copy"
  else
    if [ "$tier" = "STRICT" ]; then
      echo "FAIL  [STRICT] drift: $copy != canon $canon"
      diff -u <(norm "$ROOT/$canon") <(norm "$ROOT/$copy") | sed 's/^/      /'
      FAIL=$((FAIL + 1))
    else
      echo "WARN  [TRACK] divergent (known): $copy != canon $canon"
      WARN=$((WARN + 1))
    fi
  fi
}

# ---------------------------------------------------------------------------
# STRICT: timing-safe — single converged implementation everywhere.
# (This is the util that regressed twice: length-leak early returns crept
# back into copy-paste re-implementations. See task cmq8l5r1v005v01lryjkkeyja.)
# ---------------------------------------------------------------------------
check_pair STRICT "packages/security/src/timing-safe.ts" "pd-private/next/src/lib/timing-safe.ts"
check_pair STRICT "packages/security/src/timing-safe.ts" "jf-private/src/lib/timing-safe.ts"
check_pair STRICT "packages/security/src/timing-safe.ts" "sh-private/src/lib/timing-safe.ts"
check_pair STRICT "packages/security/src/timing-safe.ts" "app/src/lib/crypto-helpers.ts"

# ---------------------------------------------------------------------------
# STRICT: sanitize-html — VS app copy matches canon today; keep it that way.
# ---------------------------------------------------------------------------
check_pair STRICT "packages/security/src/sanitize-html.ts" "app/src/lib/sanitize-html.ts"

# ---------------------------------------------------------------------------
# TRACK: known-divergent copies (per-project profiles / auth stacks).
# Converge them, then promote to STRICT.
# ---------------------------------------------------------------------------
check_pair TRACK "packages/security/src/sanitize-html.ts" "pd-private/next/src/lib/sanitize-html.ts"
check_pair TRACK "packages/security/src/sanitize-html.ts" "jf-private/src/lib/sanitize-html.ts"
check_pair TRACK "packages/security/src/sanitize-html.ts" "sh-private/src/lib/sanitize-html.ts"
check_pair TRACK "packages/security/src/rate-limit.ts"    "pd-private/next/src/lib/rate-limit.ts"
check_pair TRACK "packages/security/src/rate-limit.ts"    "sh-private/src/lib/rate-limit.ts"
check_pair TRACK "packages/security/src/rate-limit.ts"    "app/src/lib/rate-limit.ts"
check_pair TRACK "packages/security/src/auth-helpers.ts"  "jf-private/src/lib/auth-helpers.ts"
check_pair TRACK "packages/security/src/auth-helpers.ts"  "sh-private/src/lib/auth-helpers.ts"
check_pair TRACK "packages/security/src/auth-helpers.ts"  "app/src/lib/auth-helpers.ts"

echo
echo "security-utils-check: ${FAIL} fail, ${WARN} warn"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
