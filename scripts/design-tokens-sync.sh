#!/usr/bin/env bash
#
# design-tokens-sync.sh — drift report: canonical design tokens vs projects.
#
# Canon: packages/design-tokens/tokens.css (shadcn naming,
# PD-canon values + unified --status-* scheme — see the package README).
# Each project keeps its own globals.css (separate git repos, copy-sync
# model like scripts/security-utils-check.sh). This script compares the
# canon's :root (light) and .dark blocks against each project and reports:
#
#   DRIFT    token exists in the project but with a different value
#   MISSING  canon token not defined in the project (expected at baseline —
#            per-project migration is tracked in separate tasks)
#   SKIP     known intentional divergence (KO --accent exception,
#            .claude/rules/css-tokens-sync.md)
#
# REPORT-ONLY: never auto-fixes, always exits 0. Once a project is migrated,
# its DRIFT count becoming non-zero is the signal to re-sync.
#
# Usage:
#   bash scripts/design-tokens-sync.sh
#     (run from anywhere; expects sibling checkouts under vibe-studio/:
#      vs-private, pd-private, jf-private, sh-private, korobkovart, bp-private)
#   TARAS_CODE_ROOT=/path/to/vibe-studio bash design-tokens-sync.sh  # override

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${TARAS_CODE_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"   # vibe-studio/
# Canon resolves relative to THIS script so the check works from a git
# worktree too (sibling projects still resolve via ROOT).
CANON="$SCRIPT_DIR/../packages/design-tokens/tokens.css"

if [ ! -f "$CANON" ]; then
  echo "FATAL missing canon: $CANON"
  exit 1
fi

# project|globals.css path|light selector|dark selector
PROJECTS="
pd|pd-private/next/src/app/globals.css|:root|.dark
jf|jf-private/src/app/globals.css|:root|.dark
sh|sh-private/src/app/globals.css|:root|.dark
ko|korobkovart/site/src/app/globals.css|:root|.dark
vs|app/src/app/globals.css|:root|:root.dark
bp|bp-private/src/app/globals.css|:root|.dark
"

# KO --accent exception (css-tokens-sync.md): intentional brand divergence.
is_skipped() { # $1=project $2=var
  [ "$1" = "ko" ] && { [ "$2" = "--accent" ] || [ "$2" = "--accent-foreground" ]; }
}

# Extract "--name|value" pairs from the FIRST "<selector> {...}" block.
# Values are normalized: trailing ';' stripped, whitespace collapsed.
extract_block() { # $1=file $2=selector
  awk -v sel="$2 {" '
    $0 == sel { inblock = 1; next }
    inblock && /^\}/ { exit }
    inblock
  ' "$1" \
    | grep -oE -- '--[A-Za-z0-9_-]+:[^;]+' \
    | sed -E 's/:[[:space:]]*/|/; s/[[:space:]]+/ /g; s/ $//'
}

lookup() { # $1=pairs $2=name -> prints value or nothing
  printf '%s\n' "$1" | awk -F'|' -v n="$2" '$1 == n { print $2; exit }'
}

TOTAL_DRIFT=0

for theme in light dark; do
  if [ "$theme" = "light" ]; then
    CANON_PAIRS="$(extract_block "$CANON" ":root")"
  else
    CANON_PAIRS="$(extract_block "$CANON" ".dark")"
  fi

  echo "=== Theme: $theme ($(printf '%s\n' "$CANON_PAIRS" | wc -l | tr -d ' ') canon tokens) ==="

  printf '%s\n' "$PROJECTS" | grep -v '^$' | while IFS='|' read -r proj path lightsel darksel; do
    file="$ROOT/$path"
    if [ ! -f "$file" ]; then
      echo "WARN  [$proj] missing globals.css: $path (repo not checked out?)"
      continue
    fi
    sel="$lightsel"; [ "$theme" = "dark" ] && sel="$darksel"
    PROJ_PAIRS="$(extract_block "$file" "$sel")"

    ok=0 drift=0 missing=0 skip=0
    missing_names=""
    while IFS='|' read -r name canon_val; do
      [ -z "$name" ] && continue
      if is_skipped "$proj" "$name"; then
        skip=$((skip + 1)); continue
      fi
      proj_val="$(lookup "$PROJ_PAIRS" "$name")"
      if [ -z "$proj_val" ]; then
        missing=$((missing + 1)); missing_names="$missing_names $name"
      elif [ "$proj_val" = "$canon_val" ]; then
        ok=$((ok + 1))
      else
        drift=$((drift + 1))
        echo "DRIFT [$proj/$theme] $name: project '$proj_val' != canon '$canon_val'"
      fi
    done <<EOF
$CANON_PAIRS
EOF

    echo "----  [$proj/$theme] ok=$ok drift=$drift missing=$missing skip=$skip"
    if [ "$missing" -gt 0 ]; then
      echo "      missing:$missing_names" | fold -s -w 100 | sed '2,$s/^/      /'
    fi
    echo "$drift" >> "${TMPDIR:-/tmp}/dts-drift-$$"
  done
  echo
done

if [ -f "${TMPDIR:-/tmp}/dts-drift-$$" ]; then
  TOTAL_DRIFT=$(awk '{ s += $1 } END { print s }' "${TMPDIR:-/tmp}/dts-drift-$$")
  rm -f "${TMPDIR:-/tmp}/dts-drift-$$"
fi

echo "design-tokens-sync: total drift = $TOTAL_DRIFT (report-only; MISSING is expected until per-project migration tasks land)"
exit 0
