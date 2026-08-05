#!/bin/bash
# cron-wrapper.sh — Run a cron command, pass its stdout through, alert on non-zero exit.
#
# Usage (in crontab):
#   */2 * * * * /opt/docker/scripts/cron-wrapper.sh poll-planning /opt/docker/scripts/poll-planning.sh
#   * * * * *   /opt/docker/scripts/cron-wrapper.sh nas-metrics  /opt/docker/scripts/nas-metrics.sh  > /opt/docker/status/data/nas-metrics.json
#
# First arg is a short tag for logs and alerts; the rest is the command.
# stdout is passed through verbatim so wrapped crons that pipe JSON to a file
# keep working. stderr is captured and attached to Telegram alerts when the
# command exits non-zero. Silent on exit 0 (no stdout noise beyond what the
# wrapped command produced).
#
# Catches the class of silent failures that bit us on 2026-04-19 when
# poll-planning.sh exited 1 on a pipeline error inside `set -euo pipefail`
# and auto-planning stayed dead for 13 min without any surface signal.

set -u

TAG="${1:-cron-wrapper}"
shift || { echo "usage: cron-wrapper.sh <tag> <command> [args...]" >&2; exit 64; }

OUT_FILE=$(mktemp)
ERR_FILE=$(mktemp)
trap 'rm -f "$OUT_FILE" "$ERR_FILE"' EXIT

"$@" >"$OUT_FILE" 2>"$ERR_FILE"
RC=$?

# Always pass stdout through so `wrapper … > file.json` keeps the same
# behaviour as the unwrapped script did. Breaking this silently emptied
# status/data/*.json on 2026-04-19 within minutes of enabling the wrapper.
cat "$OUT_FILE"

if [ "$RC" -ne 0 ]; then
  ERR_SNIPPET="$(head -c 1500 "$ERR_FILE")"
  OUT_SNIPPET="$(head -c 500 "$OUT_FILE")"
  MSG="[cron] ${TAG} exited ${RC} at $(date -u '+%Y-%m-%d %H:%M UTC')

stderr:
${ERR_SNIPPET}"
  if [ -n "$OUT_SNIPPET" ]; then
    MSG="${MSG}

stdout (first 500 chars):
${OUT_SNIPPET}"
  fi
  /opt/docker/scripts/send-tg-alert.sh "$MSG" || true
  logger -t "cron-wrapper-${TAG}" "exit=${RC} stderr=${ERR_SNIPPET:0:300}"
  exit "$RC"
fi
exit 0
