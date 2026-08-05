#!/usr/bin/env bash
# AI-20260601-0006: Monthly MemPalace recall@5 regression eval.
#
# Runs run_eval.py against the standing query set (q01..q13 — q11..q13 added
# 2026-06-01 to detect freshness regressions in recent decisions/incidents),
# stores results under eval/results-monthly/, and sends a Telegram summary
# alert when recall@5 drops more than 5 percentage points from the
# 2026-05-11 baseline (83.3%).
#
# Scheduled via VPS crontab:
#   0 6 1 * * /opt/repos/vibe-studio/services/mempalace/eval/cron.sh
#
# Wrapped with cron-wrapper so non-zero exit triggers an alert:
#   0 6 1 * * /opt/docker/scripts/cron-wrapper.sh mempalace-eval-monthly \
#     /opt/repos/vibe-studio/services/mempalace/eval/cron.sh
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
EVAL_DIR="/opt/repos/vibe-studio/services/mempalace/eval"
RESULTS_DIR="${EVAL_DIR}/results-monthly"
DATE="$(date -u +%Y%m%d)"
OUT_FILE="${RESULTS_DIR}/results-${DATE}.md"

# Recall baseline (post-reranker, 2026-05-11 — see results-20260511-reranker.md)
# REV22-052: threshold tightened from 5pp → 2pp (recent eval showed 84.6→80.8
# regression that crossed the old 70% floor without alerting). p95 latency
# alerting added below.
BASELINE_RECALL=83.3
ALERT_THRESHOLD_DELTA=2.0  # percentage points (tightened REV22-052)

TG_BOT_TOKEN="${TG_BOT_TARASCLOUDBOT:-}"
TG_CHAT_ID="${TARAS_TG_CHAT_ID:-100000000}"

mkdir -p "${RESULTS_DIR}"

# ── Helpers ───────────────────────────────────────────────────────────────────
send_tg() {
    local msg="$1"
    # Infisical-managed env (canonical) first; /opt/docker/.env copy is stale (401 as of 2026-06-11)
    for env_file in /opt/docker/secrets/.infra.env /opt/docker/.env; do
        if [ -z "${TG_BOT_TOKEN}" ] && [ -f "${env_file}" ]; then
            TG_BOT_TOKEN="$(grep -E '^TG_BOT_TARASCLOUDBOT=' "${env_file}" | cut -d= -f2-)"
        fi
    done
    if [ -z "${TG_BOT_TOKEN}" ]; then
        echo "[cron-eval] WARN: TG_BOT_TARASCLOUDBOT not set, skipping Telegram alert" >&2
        return 0
    fi
    curl -sS -m 15 -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${TG_CHAT_ID}" \
        -d "parse_mode=Markdown" \
        --data-urlencode "text=${msg}" > /dev/null || true
}

# ── Run eval ──────────────────────────────────────────────────────────────────
echo "[cron-eval] $(date -u +%Y-%m-%dT%H:%M:%SZ) starting monthly MemPalace eval"

cd "${EVAL_DIR}"

# Use the venv that the manual eval runs use, falling back to system python3
PYTHON_BIN="python3"
if [ -x "/opt/repos/vibe-studio/services/mempalace/eval/.venv/bin/python3" ]; then
    PYTHON_BIN="/opt/repos/vibe-studio/services/mempalace/eval/.venv/bin/python3"
fi

if ! "${PYTHON_BIN}" run_eval.py --output "${OUT_FILE}" 2>&1 | tee -a "${OUT_FILE}.log"; then
    send_tg "*MemPalace monthly eval FAILED* %0A%0ADate: ${DATE} %0A%0AScript exited non-zero — investigate ${OUT_FILE}.log"
    exit 1
fi

# ── Extract recall@5 ──────────────────────────────────────────────────────────
# The markdown report contains: "| AVG Recall@5 | 0.85 (84.6%) |" — grab the
# percentage in parentheses (same scale as BASELINE_RECALL).
RECALL="$(grep -E 'AVG Recall@5' "${OUT_FILE}" | head -1 | grep -oE '\([0-9]+\.?[0-9]*%\)' | grep -oE '[0-9]+\.?[0-9]*' || true)"

if [ -z "${RECALL}" ]; then
    send_tg "*MemPalace monthly eval — could not parse Recall@5* %0A%0ADate: ${DATE} %0A%0AOutput: ${OUT_FILE}"
    exit 2
fi

DELTA="$(awk -v r="${RECALL}" -v b="${BASELINE_RECALL}" 'BEGIN { printf "%.1f", r - b }')"
ABS_DELTA="$(awk -v d="${DELTA}" 'BEGIN { printf "%.1f", (d < 0 ? -d : d) }')"

echo "[cron-eval] recall@5=${RECALL}% baseline=${BASELINE_RECALL}% delta=${DELTA}pp"

# ── p95 latency check (REV22-052) ────────────────────────────────────────────
# run_eval.py writes "| p95 latency | X.Xs |" in the results table.
P95="$(grep -E 'p95 latency' "${OUT_FILE}" | head -1 | grep -oE '[0-9]+\.?[0-9]*s' | grep -oE '[0-9]+\.?[0-9]*' || true)"
P95_ALERT=0
P95_THRESHOLD=5.0

if [ -n "${P95}" ]; then
    echo "[cron-eval] p95_latency=${P95}s threshold=${P95_THRESHOLD}s"
    if awk -v p="${P95}" -v t="${P95_THRESHOLD}" 'BEGIN { exit !(p >= t) }'; then
        echo "[cron-eval] WARN: p95 latency ${P95}s >= ${P95_THRESHOLD}s threshold"
        P95_ALERT=1
    fi
else
    echo "[cron-eval] WARN: could not parse p95 latency from ${OUT_FILE}"
fi

# ── Telegram summary (always send) + alert on regression ─────────────────────
SUMMARY_MSG="*MemPalace monthly eval — ${DATE}* %0A%0ARecall@5: \`${RECALL}%\` %0ABaseline (2026-05-11): \`${BASELINE_RECALL}%\` %0ADelta: \`${DELTA}pp\`"

if [ -n "${P95}" ]; then
    SUMMARY_MSG="${SUMMARY_MSG}%0Ap95 latency: \`${P95}s\`"
fi

if awk -v ad="${ABS_DELTA}" -v t="${ALERT_THRESHOLD_DELTA}" 'BEGIN { exit !(ad >= t) }'; then
    SUMMARY_MSG="${SUMMARY_MSG}%0A%0A⚠️ *Regression beyond ±${ALERT_THRESHOLD_DELTA}pp* — investigate ${OUT_FILE}"
fi

if [ "${P95_ALERT}" -eq 1 ]; then
    SUMMARY_MSG="${SUMMARY_MSG}%0A⚠️ *p95 latency ${P95}s ≥ ${P95_THRESHOLD}s* — check reranker/pg load"
fi

send_tg "${SUMMARY_MSG}"

echo "[cron-eval] done — wrote ${OUT_FILE}"
exit 0
