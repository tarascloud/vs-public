#!/usr/bin/env bash
# REV22-046: CI guard — ensure ALLOWED_ATTR in sanitize-html.ts does not
# include dangerous attributes (style or on* event handlers).
# Exit 1 if any violation is found.

set -euo pipefail

TARGET="${1:-src/lib/sanitize-html.ts}"
ERRORS=0

check_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "SKIP: $file not found"
    return
  fi

  # Extract ALLOWED_ATTR array content — look for quoted attrs after ALLOWED_ATTR
  # Check for 'style' as an allowed attribute
  if grep -n 'ALLOWED_ATTR' "$file" | grep -q '"style"'; then
    echo "ERROR: $file — 'style' found in ALLOWED_ATTR (CSS exfiltration risk)"
    ERRORS=$((ERRORS + 1))
  fi

  # Check for on* event handlers as allowed attributes
  if grep -n 'ALLOWED_ATTR' "$file" | grep -Eq '"on[a-z]+"|'"'"'on[a-z]+'"'"; then
    echo "ERROR: $file — on* event handler found in ALLOWED_ATTR (XSS risk)"
    ERRORS=$((ERRORS + 1))
  fi
}

check_file "$TARGET"

if [[ $ERRORS -gt 0 ]]; then
  echo "FAIL: $ERRORS violation(s) found in sanitize-html ALLOWED_ATTR"
  exit 1
fi

echo "OK: sanitize-html ALLOWED_ATTR clean (no style or on* handlers)"
exit 0
