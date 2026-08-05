#!/bin/bash
# status-mem-monitor.sh — Log status container RSS and alert if >600MiB.
# Runs every 15min via cron. DEV-20260601-0021.

set -euo pipefail

LOG_FILE="${STATUS_MEM_LOG:-/opt/docker/logs/status-mem.log}"
THRESHOLD_MIB="${STATUS_MEM_THRESHOLD_MIB:-600}"
ALERT_SCRIPT="/opt/docker/scripts/send-tg-alert.sh"

MEM_USAGE=$(docker stats --no-stream status --format "{{.MemUsage}}" 2>/dev/null || echo "UNAVAILABLE")
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "${TS} ${MEM_USAGE}" >> "${LOG_FILE}"

CURRENT="${MEM_USAGE%% /*}"
if [[ "$CURRENT" == *GiB ]]; then
    NUM="${CURRENT%GiB}"
    MIB=$(echo "$NUM" | awk "{printf \"%.0f\", \$1 * 1024}")
elif [[ "$CURRENT" == *MiB ]]; then
    NUM="${CURRENT%MiB}"
    MIB=$(echo "$NUM" | awk "{printf \"%.0f\", \$1}")
else
    exit 0
fi

if [ "${MIB}" -gt "${THRESHOLD_MIB}" ]; then
    MSG="[ALERT] status container RSS ${CURRENT} > ${THRESHOLD_MIB}MiB threshold. Check: docker logs --tail 100 status"
    if [ -x "${ALERT_SCRIPT}" ]; then
        "${ALERT_SCRIPT}" "${MSG}" || true
    fi
    logger -t status-mem-monitor "RSS ${MIB}MiB exceeds ${THRESHOLD_MIB}MiB threshold"
fi
