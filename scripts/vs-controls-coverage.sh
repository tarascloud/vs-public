#!/usr/bin/env bash
# vs-controls-coverage.sh — CI test for ARC-20260507-0005.
#
# Verifies that every command literal defined in the ACTIONS dictionary of
# `app/src/app/api/studio/actions/[action]/route.ts` is also
# whitelisted in `/opt/docker/scripts/vs-controls-runner.sh`. If the runner
# drifts (route adds a new action, runner not updated, or vice versa), the
# new command would either be silently denied at runtime OR (worse) any
# existing whitelist entry could match a typo'd variant.
#
# Run modes:
#   * Unit (default): extracts ACTIONS commands, compares against runner.
#   * --with-runner: reserved (no-op, would side-effect prod).
#
# Exit code 0 on success, non-zero on any drift. Designed for pre-commit
# (pre-commit hook installs symlink) AND CI.

set -euo pipefail

ROUTE="${ROUTE:-app/src/app/api/studio/actions/[action]/route.ts}"
RUNNER="${RUNNER:-/opt/docker/scripts/vs-controls-runner.sh}"
WITH_RUNNER=0

for arg in "$@"; do
  case "$arg" in
    --with-runner) WITH_RUNNER=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  esac
done

if [[ ! -f "$ROUTE" ]]; then
  echo "vs-controls-coverage: route file not found: $ROUTE" >&2
  exit 2
fi
if [[ ! -f "$RUNNER" ]]; then
  echo "vs-controls-coverage: runner not found at $RUNNER" >&2
  exit 4
fi

# Use python helper to extract ACTIONS commands and compare against runner.
# Both literals are normalized: TypeScript escape sequences (\\n, \\t, \\")
# are decoded so the comparison matches what bash will actually receive at
# runtime via SSH_ORIGINAL_COMMAND.
python3 - "$ROUTE" "$RUNNER" <<'PY'
import re
import sys

route_path, runner_path = sys.argv[1], sys.argv[2]
route_src = open(route_path).read()
runner_src = open(runner_path).read()

# Extract: command: "..." or command: '...'
pattern = re.compile(
    r'command:\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')',
    re.DOTALL,
)


def decode_ts(literal: str) -> str:
    """Decode TS string literal escapes (the bits the bash case will see)."""
    quote = literal[0]
    body = literal[1:-1]
    # Sequence matters: longer escapes first, then \\ last so we don't double-strip.
    # NB: only escape sequences that bash actually unescapes when reading the
    # SSH_ORIGINAL_COMMAND env var should be decoded here. Bash treats single-
    # quoted strings as raw, so route TS literal \\t corresponds to runner's
    # literal \\t (two chars), NOT a real tab. Same for \\n / \\r.
    body = body.replace('\\"', '"').replace("\\'", "'")
    body = body.replace('\\\\', '\\')
    return body


cmds = [decode_ts(m.group(1)) for m in pattern.finditer(route_src)]
print(f"vs-controls-coverage: route has {len(cmds)} actions")

runner_cmd_vars = re.findall(r'^[A-Z_]+_CMD=', runner_src, re.MULTILINE)
print(f"vs-controls-coverage: runner has {len(runner_cmd_vars)} whitelisted *_CMD vars")

failed = 0
for cmd in cmds:
    short = cmd[:80].replace('\n', ' ')
    if cmd in runner_src:
        print(f"  OK   {short}")
    else:
        # Try with bash-tab escape variant: runner stores literal $'\t'
        # while route may have \\t in TS source. Already decoded.
        print(f"  FAIL {short}", file=sys.stderr)
        failed += 1

if failed:
    print(f"\nvs-controls-coverage: {failed} action(s) missing from {runner_path} whitelist.", file=sys.stderr)
    print("Fix: add the exact command literal to the runner and update the case statement.", file=sys.stderr)
    sys.exit(1)

print("vs-controls-coverage: PASS")
PY
