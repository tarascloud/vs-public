#!/usr/bin/env bash
# Weekly scrubber regression check (DEV-20260507-0032).
#
# Runs:
#   1. pytest scrubber/tests/  — verify all known patterns still redact
#   2. Sample 20 random drawers from pg:mempalace and re-run scrubber over
#      their content to detect pattern drift (i.e. content that should have
#      been scrubbed at ingest time but slipped through).
#
# Scheduled: Sunday 06:00 UTC (after backup + restore drill).
# Logs: /opt/docker/backups/mempalace-scrubber-weekly.log
# Alerts: cron-wrapper.sh tags 'mempalace-scrubber' → Telegram on non-zero exit.
#
# Requires: docker, ssh access to pg container (already used by other mempalace scripts).

set -eo pipefail

REPO_DIR="/opt/repos/vibe-studio"
SCRUBBER_DIR="${REPO_DIR}/services/mempalace/scrubber"
PG_CONTAINER="pg"
SAMPLE_SIZE=20

DATE=$(date +%Y-%m-%d_%H:%M:%S)
echo "[${DATE}] === MemPalace scrubber weekly check ==="

# ── Step 1: pytest the scrubber package ───────────────────────────────────
echo "[$(date +%H:%M:%S)] Running pytest in scrubber/tests/"
cd "${SCRUBBER_DIR}"

# Use the same Python the mempalace container uses for ingestion.
# Falls back to system python3 if mempalace container is down.
if docker ps --format '{{.Names}}' | grep -q '^mempalace$'; then
    docker exec mempalace bash -c "cd /opt/mempalace/scrubber && python3 -m pytest tests/ -v --tb=short" 2>&1 || {
        echo "ERROR: pytest failed in mempalace container"
        exit 2
    }
else
    python3 -m pytest "${SCRUBBER_DIR}/tests/" -v --tb=short 2>&1 || {
        echo "ERROR: pytest failed on host (mempalace container down?)"
        exit 2
    }
fi

# ── Step 2: Sample 20 random drawers and re-scrub ─────────────────────────
# Pulls 20 random rows, pipes content through scrubber, prints any findings.
# Findings = pattern that fires NOW on stored content => pattern drift / missed.

echo "[$(date +%H:%M:%S)] Sampling ${SAMPLE_SIZE} random drawers from pg:mempalace"

SAMPLE_SQL="SELECT id, source, substring(content, 1, 4000) FROM drawers ORDER BY random() LIMIT ${SAMPLE_SIZE};"

# Read from pg via docker exec — output as TSV (tab-separated, easier to parse).
docker exec "$PG_CONTAINER" psql -U mempalace -d mempalace -tAF $'\t' -c "$SAMPLE_SQL" \
    > /tmp/mempalace_sample_${DATE//[:\/]/-}.tsv

SAMPLE_FILE="/tmp/mempalace_sample_${DATE//[:\/]/-}.tsv"
SAMPLE_COUNT=$(wc -l < "$SAMPLE_FILE")
echo "[$(date +%H:%M:%S)] Sampled ${SAMPLE_COUNT} drawers"

# Re-scrub content via the package — flag any findings.
DRIFT_FOUND=0
if docker ps --format '{{.Names}}' | grep -q '^mempalace$'; then
    docker cp "$SAMPLE_FILE" mempalace:/tmp/sample.tsv
    DRIFT_FOUND=$(docker exec mempalace python3 -c "
import sys
sys.path.insert(0, '/opt/mempalace')
from scrubber import Scrubber
s = Scrubber(load_env=False)
total_findings = 0
with open('/tmp/sample.tsv') as f:
    for line in f:
        parts = line.rstrip('\n').split('\t', 2)
        if len(parts) < 3:
            continue
        drawer_id, source, content = parts
        scrubbed, findings = s.scrub(content)
        if findings:
            print(f'DRIFT: drawer={drawer_id} source={source} hits={len(findings)}', file=sys.stderr)
            for f in findings[:3]:
                print(f'  - {f.pattern_name}: {f.original[:60]}...', file=sys.stderr)
            total_findings += len(findings)
print(total_findings)
" 2>&1 | tail -1)
else
    echo "WARN: mempalace container not running — skipped drift check"
fi

echo "[$(date +%H:%M:%S)] Drift findings: ${DRIFT_FOUND}"

# Cleanup
rm -f "$SAMPLE_FILE"

# Exit non-zero if drift found — surfaces as a Telegram alert via cron-wrapper.
if [ "${DRIFT_FOUND:-0}" -gt 0 ]; then
    echo "ERROR: ${DRIFT_FOUND} pattern drift hits in ${SAMPLE_COUNT}-drawer sample. Inspect log."
    exit 3
fi

echo "[$(date +%H:%M:%S)] === scrubber weekly check OK ==="
exit 0
