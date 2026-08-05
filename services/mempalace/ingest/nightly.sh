#!/usr/bin/env bash
# MemPalace Nightly Incremental Ingestion
# Runs all 6 ingesters sequentially (ChromaDB single-writer safety)
# Scheduled: 04:45 UTC daily
# Logs: /opt/docker/backups/mempalace-ingest.log
#
# NOTE: This script writes all output to stdout/stderr only.
# The cron entry redirects to the log file:
#   45 4 * * * .../nightly.sh >> /opt/docker/backups/mempalace-ingest.log 2>&1
# Do NOT add `tee -a $LOG` inside this script — it causes duplicate lines
# when combined with the cron redirect (MP-FIX-20260411-09).

set -eo pipefail

INGEST_DIR="/opt/repos/vibe-studio/services/mempalace/ingest"
DATE=$(date +%Y-%m-%d_%H:%M:%S)

SUCCEEDED=0
FAILED=0
FAILED_NAMES=()

# AI-20260601-0001: Aggregated counts parsed from each ingester's stdout.
# Replaces the previously hardcoded "ingested=0 skipped=0 errors=0" summary
# lines that masked the actual numbers in /stats/ingest-runs and cron logs.
TOTAL_INGESTED=0
TOTAL_SKIPPED=0
TOTAL_ERRORS=0

# AI-20260601-0001: Streak of consecutive days where total_ingested across all
# ingesters was zero. Persisted between runs in this file. Triggers Telegram
# alert when it reaches the threshold (3 days) — surfaces the "silently
# stalled, no exit-code failure" failure mode.
ZERO_INGEST_STATE_FILE="/opt/docker/mempalace/ingest-state/zero_ingest_streak.json"
ZERO_INGEST_STREAK_ALERT_THRESHOLD=3

# REV-R2-20260419-0021: Critical ingesters that MUST succeed. Failure of any
# bubbles up as nightly.sh exit 1 so cron/monitoring surfaces the regression.
# REV22-052: ingest_claude_sessions.py added — it covers 64% of the corpus
# (room_sessions is the largest wing). Zero-ingest here = silent major loss.
CRITICAL_INGESTERS=("ingest_vs_db.py" "ingest_agent_wikis.py" "ingest_shuleansky.py" "ingest_claude_sessions.py")
CRITICAL_FAILED=0

echo "[$DATE] === MemPalace nightly ingest START ==="

# REV-R2-20260419-0021: Retry wrapper with exponential backoff (base 5s → 10s → 20s)
retry_cmd() {
    local max_attempts="$1"; local base_sleep="$2"; shift 2
    local attempt=1; local exit_code=0
    # Keep set +e active for the whole function; re-enabling set -e before
    # `return <non-zero>` causes the caller to exit under errexit even when
    # the caller already disabled errexit. Caller re-enables errexit after.
    set +e
    while [ "$attempt" -le "$max_attempts" ]; do
        "$@"; exit_code=$?
        if [ "$exit_code" -eq 0 ]; then return 0; fi
        if [ "$attempt" -lt "$max_attempts" ]; then
            local delay=$(( base_sleep * (2 ** (attempt - 1)) ))
            echo "[$(date +%Y-%m-%d_%H:%M:%S)] [RETRY] attempt $attempt failed (exit=$exit_code); sleeping ${delay}s before retry $((attempt + 1))/$max_attempts"
            sleep "$delay"
        fi
        attempt=$((attempt + 1))
    done
    return "$exit_code"
}

is_critical() {
    local script="$1"
    for c in "${CRITICAL_INGESTERS[@]}"; do
        [ "$c" = "$script" ] && return 0
    done
    return 1
}

# AI-20260601-0001: Parse per-ingester counts from captured stdout.
# Each Python ingester prints a final summary line in one of these formats:
#
#   ingest_claude_sessions.py:
#     [LIVE] Done: ingested=N skipped=N errors=N
#   ingest_vs_db.py:
#     [LIVE] Total: ingested=N skipped=N errors=N
#   ingest_shuleansky.py (per-entity, must aggregate):
#     [LIVE] Summary:
#       Transcripts : ingested=N skipped=N errors=N
#       Materials   : ingested=N skipped=N errors=N
#       Participants: ingested=N skipped=N errors=N
#   ingest_telegram.py:
#     [done] total success=N fail=N
#   ingest_pd_chat.py:
#     [done] success=N fail=N max_id=...
#   ingest_agent_wikis.py:
#     [LIVE] Summary:
#       agent-wikis : ingested=N skipped=N errors=N
#
# The parser is greedy but bounded — it sums every `ingested=`, `skipped=`,
# `errors=` token in lines that follow a `[LIVE] Summary:` or `[LIVE] Done:`
# or `[LIVE] Total:` header within the same script's output. For telegram
# and pd_chat we map success→ingested and fail→errors.
_parse_ingester_counts() {
    local capture_file="$1"; local script="$2"
    local ing=0 skp=0 err=0
    # Use awk to extract the numbers from canonical summary lines.
    # Strategy:
    # 1. After a header line matching ^.*\[LIVE\] (Done|Total|Summary):.*$
    #    capture every subsequent line of the same block (until blank line
    #    or new section header) that contains ingested=N skipped=N errors=N.
    # 2. For telegram/pd_chat parse `\[done\] (total )?success=N fail=N`.
    local out
    out=$(awk '
        BEGIN { in_block = 0 }
        /\[LIVE\] (Done|Total):/ {
            # Single-line summary: also matches "Done: ingested=N skipped=N errors=N"
            ing_match = match($0, /ingested=[0-9]+/); ing_val = ing_match ? substr($0, RSTART+9, RLENGTH-9) : ""
            skp_match = match($0, /skipped=[0-9]+/); skp_val = skp_match ? substr($0, RSTART+8, RLENGTH-8) : ""
            err_match = match($0, /errors=[0-9]+/);  err_val = err_match ? substr($0, RSTART+7, RLENGTH-7) : ""
            if (ing_val != "") ing += ing_val
            if (skp_val != "") skp += skp_val
            if (err_val != "") err += err_val
            in_block = 0
            next
        }
        /\[LIVE\] Summary:/ { in_block = 1; next }
        in_block && /ingested=[0-9]+ +skipped=[0-9]+ +errors=[0-9]+/ {
            match($0, /ingested=[0-9]+/); ing_val = substr($0, RSTART+9, RLENGTH-9)
            match($0, /skipped=[0-9]+/);  skp_val = substr($0, RSTART+8, RLENGTH-8)
            match($0, /errors=[0-9]+/);   err_val = substr($0, RSTART+7, RLENGTH-7)
            ing += ing_val; skp += skp_val; err += err_val
            next
        }
        in_block && /^[[:space:]]*$/ { in_block = 0; next }
        /\[done\] (total )?success=[0-9]+ +fail=[0-9]+/ {
            match($0, /success=[0-9]+/); s_val = substr($0, RSTART+8, RLENGTH-8)
            match($0, /fail=[0-9]+/);    f_val = substr($0, RSTART+5, RLENGTH-5)
            ing += s_val; err += f_val
            next
        }
        END {
            printf "%d %d %d", ing, skp, err
        }
    ' "$capture_file" 2>/dev/null)
    if [ -z "$out" ]; then out="0 0 0"; fi
    # shellcheck disable=SC2086
    set -- $out
    ing="$1"; skp="$2"; err="$3"
    # Default to 0 on any parse weirdness
    [[ "$ing" =~ ^[0-9]+$ ]] || ing=0
    [[ "$skp" =~ ^[0-9]+$ ]] || skp=0
    [[ "$err" =~ ^[0-9]+$ ]] || err=0
    echo "$ing $skp $err"
}

# run_ingester <script_name> <timeout_seconds>
run_ingester() {
    local script="$1"; local timeout_sec="$2"
    local start_ts; start_ts=$(date +%Y-%m-%d_%H:%M:%S)
    local start_iso; start_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local start_epoch; start_epoch=$(date +%s)
    local max_attempts=1
    if is_critical "$script"; then max_attempts=3; fi

    echo "[$start_ts] [START] $script (timeout: ${timeout_sec}s, attempts: $max_attempts)"

    # AI-20260601-0001: Capture stdout to a temp file so we can both stream it
    # to the cron log AND parse the per-ingester counts. `tee` preserves the
    # exit code via PIPESTATUS so retry logic still works.
    local capture; capture=$(mktemp -t mp-ingest-XXXXXX)
    set +e
    retry_cmd "$max_attempts" 5 bash -c "timeout $timeout_sec python3 '$INGEST_DIR/$script' 2>&1 | tee '$capture'; exit \${PIPESTATUS[0]}"
    local exit_code=$?
    set -e

    local end_ts; end_ts=$(date +%Y-%m-%d_%H:%M:%S)
    local end_epoch; end_epoch=$(date +%s)
    local duration_sec=$(( end_epoch - start_epoch ))
    local status_label
    if [ "$exit_code" -eq 0 ]; then
        echo "[$end_ts] [OK]    $script — succeeded"
        SUCCEEDED=$((SUCCEEDED + 1))
        status_label="ok"
    elif [ "$exit_code" -eq 124 ]; then
        echo "[$end_ts] [FAIL]  $script — TIMEOUT after ${timeout_sec}s (exit 124)"
        FAILED=$((FAILED + 1)); FAILED_NAMES+=("$script(TIMEOUT)")
        if is_critical "$script"; then CRITICAL_FAILED=$((CRITICAL_FAILED + 1)); fi
        status_label="timeout"
    else
        echo "[$end_ts] [FAIL]  $script — exit code $exit_code"
        FAILED=$((FAILED + 1)); FAILED_NAMES+=("$script(exit=$exit_code)")
        if is_critical "$script"; then CRITICAL_FAILED=$((CRITICAL_FAILED + 1)); fi
        status_label="fail"
    fi

    # AI-20260601-0001: Parse real counts from captured stdout.
    local counts; counts=$(_parse_ingester_counts "$capture" "$script")
    # shellcheck disable=SC2086
    set -- $counts
    local ingested="$1"; local skipped="$2"; local errors="$3"
    rm -f "$capture"

    TOTAL_INGESTED=$((TOTAL_INGESTED + ingested))
    TOTAL_SKIPPED=$((TOTAL_SKIPPED + skipped))
    TOTAL_ERRORS=$((TOTAL_ERRORS + errors))

    # Canonical SUMMARY line consumed by /stats/ingest-runs parser.
    # AI-20260601-0001: now uses real parsed counts instead of hardcoded zeros.
    echo "[$start_iso] SUMMARY ingester=$script status=$status_label ingested=$ingested skipped=$skipped errors=$errors duration_sec=$duration_sec"
}

# REV-20260419-0043 + REV-R2-20260419-0021:
# Pre-resolve pg container IP and export as PG_HOST. pg is NOT exposed on
# 127.0.0.1 on VPS, so ingesters must use either the docker network IP or
# the in-network 'pg' hostname. Previously ingesters silently fell back to
# "localhost" when docker-inspect failed, breaking vs_db + agent_wikis.
if [ -z "${PG_HOST:-}" ]; then
    if command -v docker >/dev/null 2>&1; then
        RESOLVED_PG_HOST=$(docker inspect pg --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' 2>/dev/null | awk '{print $1}')
        if [ -n "$RESOLVED_PG_HOST" ]; then
            export PG_HOST="$RESOLVED_PG_HOST"
            echo "[$(date +%Y-%m-%d_%H:%M:%S)] [INFO] PG_HOST=$PG_HOST (resolved via docker inspect)"
        else
            echo "[$(date +%Y-%m-%d_%H:%M:%S)] [WARN] Could not resolve pg container IP; ingesters will try fallbacks"
        fi
    else
        echo "[$(date +%Y-%m-%d_%H:%M:%S)] [WARN] docker not on PATH; ingesters will try fallbacks"
    fi
fi

# REV-R2-20260419-0021: Last-resort VPS fallback so critical ingesters at
# least ATTEMPT docker DNS 'pg' instead of silently going to localhost.
if [ -z "${PG_HOST:-}" ] && [ -d /opt/docker ]; then
    export PG_HOST="pg"
    echo "[$(date +%Y-%m-%d_%H:%M:%S)] [INFO] PG_HOST=pg (last-resort VPS fallback)"
fi

# REV-R2-20260419-0029: Propagate to SH_DB_HOST so shuleansky ingester uses
# the same resolution (its precedence: SH_DB_HOST > PG_HOST > localhost-probe).
if [ -z "${SH_DB_HOST:-}" ] && [ -n "${PG_HOST:-}" ]; then
    export SH_DB_HOST="$PG_HOST"
fi

# Load secrets if available
if [ -f /opt/docker/secrets/.mempalace.env ]; then
    # shellcheck disable=SC1091
    set -o allexport
    source /opt/docker/secrets/.mempalace.env
    set +o allexport
fi

# REV-31: Extra Claude sessions dir (Mac sessions synced via байбай scp)
if [ -d /home/owner/.claude/projects/_mac ]; then
    export CLAUDE_EXTRA_PROJECTS_DIR="/home/owner/.claude/projects/_mac"
    # REV22-052: Warn when _mac staging dir has not been updated for 7+ days.
    # Indicates that "байбай" rsync from Mac has not run recently — Mac sessions
    # would be silently absent from MemPalace (the silent major-loss failure mode).
    _MAC_MTIME_FILE=$(find /home/owner/.claude/projects/_mac -maxdepth 1 -name "*.jsonl" -o -name "*.json" 2>/dev/null | sort -r | head -1)
    if [ -n "$_MAC_MTIME_FILE" ]; then
        _MAC_MTIME_EPOCH=$(stat -c %Y "$_MAC_MTIME_FILE" 2>/dev/null || echo 0)
        _NOW_EPOCH=$(date +%s)
        _MAC_AGE_DAYS=$(( (_NOW_EPOCH - _MAC_MTIME_EPOCH) / 86400 ))
        if [ "$_MAC_AGE_DAYS" -ge 7 ]; then
            echo "[$(date +%Y-%m-%d_%H:%M:%S)] [WARN] REV22-052 _mac staging stale: newest file is ${_MAC_AGE_DAYS}d old ($(basename "$_MAC_MTIME_FILE")). Run 'байбай' on Mac to sync Claude sessions via rsync."
        fi
    else
        echo "[$(date +%Y-%m-%d_%H:%M:%S)] [WARN] REV22-052 _mac staging dir exists but contains no .jsonl/.json session files. Mac sessions were never synced or rsync failed."
    fi
fi

# REV-POST-20260419-06: Parse CLI flags for safer test invocation.
# Usage:
#   bash nightly.sh                    # normal prod run
#   bash nightly.sh --test fail        # synthetic failure WITHOUT Telegram alert
#   TEST_MODE=1 FORCE_FAIL=1 bash nightly.sh  # same result via env vars
# Legacy env: FORCE_FAIL=1 alone still works but also suppresses Telegram
# (see alert block below). TEST_MODE=1 / DRY_RUN=1 force no-alert regardless.
for arg in "$@"; do
    case "$arg" in
        --test)  TEST_MODE=1 ;;
        fail)    FORCE_FAIL=1 ;;
        --dry-run) DRY_RUN=1 ;;
    esac
done
export TEST_MODE DRY_RUN FORCE_FAIL

if [ -n "${TEST_MODE:-}${DRY_RUN:-}" ]; then
    echo "[$(date +%Y-%m-%d_%H:%M:%S)] [TEST] Running in TEST_MODE — Telegram alerts will be suppressed"
fi

# MP-FIX-20260411-09 test hook: force a synthetic failure
if [ -n "${FORCE_FAIL:-}" ]; then
    run_ingester "nonexistent_forced_fail.py" 5
else
    run_ingester "ingest_claude_sessions.py" 600
    run_ingester "ingest_pd_chat.py"         300
    run_ingester "ingest_shuleansky.py"      1800
    run_ingester "ingest_telegram.py"        300
    run_ingester "ingest_vs_db.py"           600
    run_ingester "ingest_agent_wikis.py"     300
    # REV22-052: 7th ingester — MEMORY.md + feedback_*.md → wing_workflow/room_feedback
    run_ingester "ingest_memory_md.py"       120
fi

FINISH_TS=$(date +%Y-%m-%d_%H:%M:%S)
TOTAL=$((SUCCEEDED + FAILED))
echo "[$FINISH_TS] === SUMMARY: $SUCCEEDED/$TOTAL succeeded, $FAILED failed (critical_failed=$CRITICAL_FAILED) ==="

if [ "${#FAILED_NAMES[@]}" -gt 0 ]; then
    echo "[$FINISH_TS] Failed ingesters: ${FAILED_NAMES[*]}"
fi

# AI-20260601-0001: HEALTH line — aggregated counts across all ingesters
# plus the consecutive-zero-ingest streak. Picked up by external monitoring.
# Update streak file on each run; alert when streak reaches threshold.
ZERO_STREAK=0
if [ -z "${TEST_MODE:-}${DRY_RUN:-}${FORCE_FAIL:-}" ]; then
    # Load previous streak (best-effort, default 0)
    if [ -f "$ZERO_INGEST_STATE_FILE" ]; then
        # streak file is JSON: {"streak": N, "last_run": "...", "last_ingested": N}
        PREV_STREAK=$(python3 -c "import json,sys
try:
    with open('$ZERO_INGEST_STATE_FILE') as f:
        s = json.load(f)
    print(int(s.get('streak', 0)))
except Exception:
    print(0)
" 2>/dev/null || echo 0)
    else
        PREV_STREAK=0
    fi

    if [ "$TOTAL_INGESTED" -eq 0 ]; then
        ZERO_STREAK=$((PREV_STREAK + 1))
    else
        ZERO_STREAK=0
    fi

    # Persist updated streak
    mkdir -p "$(dirname "$ZERO_INGEST_STATE_FILE")" 2>/dev/null || true
    python3 -c "import json
with open('$ZERO_INGEST_STATE_FILE', 'w') as f:
    json.dump({'streak': $ZERO_STREAK, 'last_run': '$FINISH_TS', 'last_ingested': $TOTAL_INGESTED}, f)
" 2>/dev/null || echo "[$FINISH_TS] [WARN] Could not persist zero-ingest streak state"
fi

echo "[$FINISH_TS] HEALTH total_ingested=$TOTAL_INGESTED total_skipped=$TOTAL_SKIPPED total_errors=$TOTAL_ERRORS total_failed=$FAILED streak_zero_ingest_days=$ZERO_STREAK"

echo "[$FINISH_TS] === MemPalace nightly ingest DONE ==="

# AI-20260601-0001: Telegram alert when zero-ingest streak crosses threshold.
# Surfaces the failure mode where every ingester reports "ok" but no new
# drawers are actually added for multiple days (which is what triggered the
# original AI-20260601-0001 investigation: 8+ silent days of total=0).
# Alert exactly once when the streak FIRST reaches the threshold; subsequent
# days continue to warn in stdout but do not re-spam Telegram.
if [ "$ZERO_STREAK" -ge "$ZERO_INGEST_STREAK_ALERT_THRESHOLD" ] \
        && [ -z "${FORCE_FAIL:-}" ] && [ -z "${TEST_MODE:-}" ] && [ -z "${DRY_RUN:-}" ]; then
    # Re-send only if streak == threshold OR streak is multiple of (threshold * 2)
    # to avoid daily spam after the first alert.
    SHOULD_ALERT=0
    if [ "$ZERO_STREAK" -eq "$ZERO_INGEST_STREAK_ALERT_THRESHOLD" ]; then
        SHOULD_ALERT=1
    elif [ $((ZERO_STREAK % (ZERO_INGEST_STREAK_ALERT_THRESHOLD * 2))) -eq 0 ]; then
        SHOULD_ALERT=1
    fi

    if [ "$SHOULD_ALERT" -eq 1 ]; then
        ZTOKEN=""
        if [ -f /opt/docker/secrets/.pd-bot.env ]; then
            ZTOKEN=$(sudo -n grep -E "^TELEGRAM_BOT_TOKEN=" /opt/docker/secrets/.pd-bot.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
        fi
        if [ -n "$ZTOKEN" ]; then
            ZMSG=$(printf "WARNING MemPalace nightly ingest: ZERO new drawers for %s consecutive days\n\nLast run: %s UTC\nTotal ingested: %s\nTotal skipped: %s\nTotal errors: %s\n\nAll ingesters report success but no new content reached pg.drawers.\nProbable causes (in order of likelihood):\n  1. Source data steady-state (no new tasks DONE, no new sessions synced from Mac).\n  2. State files over-aggressive dedup (cold-start re-ingest would unblock).\n  3. Sidecar /ingest returning 202 without inserting (rare; check audit.log).\n\nDiagnostics: ssh vps 'docker exec pg psql -U mempalace -d mempalace -c \"SELECT wing, COUNT(*), MAX(filed_at) FROM drawers GROUP BY wing;\"'\n\nLog: /opt/docker/mempalace/ingest-logs/mempalace-ingest.log" "$ZERO_STREAK" "$FINISH_TS" "$TOTAL_INGESTED" "$TOTAL_SKIPPED" "$TOTAL_ERRORS")
            curl -s -X POST "https://api.telegram.org/bot${ZTOKEN}/sendMessage" \
                --data-urlencode "chat_id=100000000" \
                --data-urlencode "text=${ZMSG}" > /dev/null \
                || echo "[$FINISH_TS] [WARN] Failed to send zero-ingest Telegram alert"
            echo "[$FINISH_TS] [ALERT] Zero-ingest streak Telegram alert sent (streak=$ZERO_STREAK)"
        fi
    fi
fi

# MP-FIX-07: Telegram alert on ingest failures
# REV-POST-20260419-06: Suppress alert when any test flag is set
# (FORCE_FAIL / TEST_MODE / DRY_RUN). Ensures fail-fast self-tests never
# reach the production Telegram channel.
if [ "$FAILED" -gt 0 ] && [ -z "${FORCE_FAIL:-}" ] && [ -z "${TEST_MODE:-}" ] && [ -z "${DRY_RUN:-}" ]; then
    TELEGRAM_TOKEN=""
    if [ -f /opt/docker/secrets/.pd-bot.env ]; then
        TELEGRAM_TOKEN=$(sudo -n grep -E "^TELEGRAM_BOT_TOKEN=" /opt/docker/secrets/.pd-bot.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    fi
    if [ -n "$TELEGRAM_TOKEN" ]; then
        CHAT_ID=100000000
        FAILED_LIST="${FAILED_NAMES[*]}"
        MSG=$(printf "WARNING MemPalace nightly ingest FAILED\n\nTime: %s UTC\nSucceeded: %s/%s\nFailed: %s (critical: %s)\n\nFailed ingesters:\n%s\n\nLog: /opt/docker/backups/mempalace-ingest.log" "$FINISH_TS" "$SUCCEEDED" "$TOTAL" "$FAILED" "$CRITICAL_FAILED" "$FAILED_LIST")
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${CHAT_ID}" \
            --data-urlencode "text=${MSG}" > /dev/null || echo "[$FINISH_TS] [WARN] Failed to send Telegram alert"
        echo "[$FINISH_TS] [ALERT] Telegram notification sent to chat ${CHAT_ID}"
    else
        echo "[$FINISH_TS] [WARN] TELEGRAM_BOT_TOKEN not found in /opt/docker/secrets/.pd-bot.env - alert skipped"
    fi
elif [ "$FAILED" -gt 0 ]; then
    # REV-POST-20260419-06: Test-mode alert echo (stdout only, no Telegram)
    echo "[$FINISH_TS] [TEST][ALERT-SUPPRESSED] Would have sent Telegram alert: $FAILED failure(s): ${FAILED_NAMES[*]}"
fi

# REV-R2-20260419-0021: Fail gate — exit 1 if ANY critical ingester failed.
if [ "$CRITICAL_FAILED" -gt 0 ]; then
    echo "[$FINISH_TS] [CRITICAL] $CRITICAL_FAILED critical ingester(s) failed — nightly run marked FAILED"
    exit 1
fi

[ "$FAILED" -eq 0 ]
