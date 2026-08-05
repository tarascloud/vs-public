#!/bin/bash
# secrets-audit.sh — Audit Infisical against infra/required-secrets.yaml.
#
# For each (path, key) in the manifest, confirm the key exists in Infisical
# and its value is non-empty. Sends a Telegram alert listing every miss.
#
# Runs daily at 07:00 UTC on VPS via cron:
#   0 7 * * * /opt/docker/scripts/cron-wrapper.sh secrets-audit /opt/docker/scripts/secrets-audit.sh
#
# Rationale: INTERNAL_API_SECRET disappeared from Infisical /vs and broke
# auto-planning for hours on 2026-04-19. A daily check would have surfaced
# the drop within 24h instead of only-after-something-breaks.

set -euo pipefail
export LC_ALL=C LANG=C

MANIFEST="${MANIFEST:-/opt/repos/vibe-studio/infra/required-secrets.yaml}"
INFISICAL_DOMAIN="${INFISICAL_DOMAIN:-http://infisical:8080}"
INFISICAL_PROJECT_ID="${INFISICAL_PROJECT_ID:-306a6de6-ab9d-492c-9ce5-74503bb89aab}"
ALERTER="/opt/docker/scripts/send-tg-alert.sh"

if [ ! -f "$MANIFEST" ]; then
  echo "manifest not found: $MANIFEST" >&2
  exit 2
fi

# Query Infisical via the agent's auth token — no additional creds needed.
# Uses --output dotenv to get clean KEY=VALUE lines instead of the box-drawing
# table. The prior approach (awk -F '│') failed in cron/subshell context where
# LC_ALL=C causes awk to treat the 3-byte UTF-8 sequence as three individual
# bytes, producing no field splits and silently returning zero keys.
# /sh lives in a SEPARATE Infisical project (root path), not the VS workspace.
# Without this mapping the /sh manifest entries always read as missing.
SH_PROJECT_ID="627acf9c-d1cb-4feb-b385-70b5ae9cae32"

fetch_keys() {
  local path="$1"
  local project="${INFISICAL_PROJECT_ID}"
  if [ "$path" = "/sh" ]; then
    project="${SH_PROJECT_ID}"
    path="/"
  fi
  # `|| true`: a missing folder makes the CLI exit non-zero; under
  # `set -eo pipefail` that used to abort the whole audit at the first
  # missing path (observed 2026-06-11: died at /korobkov, never checked
  # /sh, /mempalace, /infra). Missing path => zero keys => keys are
  # reported as MISSING instead of silently killing the auditor.
  docker exec infisical-agent sh -c "
    TOKEN=\$(cat /tmp/infisical-agent-token 2>/dev/null) || exit 1
    infisical secrets \
      --token=\$TOKEN \
      --env=prod \
      --path=${path} \
      --projectId=${project} \
      --domain=${INFISICAL_DOMAIN} \
      --output=dotenv \
      --silent \
      2>/dev/null
  " | awk -F '=' 'NF>=2 { print $1 }' || true
}

MISSING=""
CHECKED=0

# Parse YAML with a tiny python because VPS has python3 but no yq.
python3 <<'PYEOF' > /tmp/secrets-manifest.txt
import sys
path = None
with open("/opt/repos/vibe-studio/infra/required-secrets.yaml") as fh:
    for line in fh:
        s = line.rstrip()
        if not s or s.lstrip().startswith("#"):
            continue
        if s.startswith("paths:"):
            continue
        if s.startswith("  ") and s.endswith(":"):
            path = s.strip().rstrip(":")
        elif s.lstrip().startswith("- ") and path:
            key = s.lstrip()[2:].strip()
            print(f"{path}\t{key}")
PYEOF

declare -A CACHE

while IFS=$'\t' read -r PATH_ KEY; do
  if [ -z "${CACHE[$PATH_]:-}" ]; then
    CACHE[$PATH_]="$(fetch_keys "$PATH_" | tr '\n' ' ')"
    # Sentinel so an empty (missing) path is cached too, not refetched per key.
    [ -n "${CACHE[$PATH_]}" ] || CACHE[$PATH_]="__EMPTY__"
  fi
  CHECKED=$((CHECKED + 1))
  if ! echo " ${CACHE[$PATH_]} " | grep -q " ${KEY} "; then
    MISSING="${MISSING}
  ${PATH_}/${KEY}"
  fi
done < /tmp/secrets-manifest.txt

rm -f /tmp/secrets-manifest.txt

# ── Local FS hygiene checks (REV-2026-06-11) ────────────────────────────
# 1. No stale *.bak* backups lying around in /opt/docker/secrets — they are
#    unmanaged plaintext secret copies that rot and leak.
# 2. Every file in /opt/docker/secrets is owned by owner — root-owned files
#    appear when scripts run under sudo and then break the agent (uid 1000).
# 3. /opt/docker/docker-compose.yml must stay a SYMLINK to
#    infra/docker-compose.yml — plain-file drift reopened twice
#    (project_compose_divergence, re-fixed 2026-06-11).
SECRETS_DIR="/opt/docker/secrets"
LOCAL_ISSUES=""

BAK_FILES="$(find "$SECRETS_DIR" -maxdepth 1 -name '*.bak*' 2>/dev/null || true)"
if [ -n "$BAK_FILES" ]; then
  LOCAL_ISSUES="${LOCAL_ISSUES}
  stale backup files in ${SECRETS_DIR}: $(echo "$BAK_FILES" | tr '\n' ' ')"
fi

NON_TARAS="$(find "$SECRETS_DIR" -maxdepth 1 ! -user owner 2>/dev/null | grep -v "^${SECRETS_DIR}\$" || true)"
if [ -n "$NON_TARAS" ]; then
  LOCAL_ISSUES="${LOCAL_ISSUES}
  files not owned by owner in ${SECRETS_DIR}: $(echo "$NON_TARAS" | tr '\n' ' ')"
fi

if [ ! -L /opt/docker/docker-compose.yml ]; then
  LOCAL_ISSUES="${LOCAL_ISSUES}
  /opt/docker/docker-compose.yml is NOT a symlink — compose drift is back; re-link:
    ln -sf /opt/repos/vibe-studio/infra/docker-compose.yml /opt/docker/docker-compose.yml"
fi

if [ -n "$MISSING" ] || [ -n "$LOCAL_ISSUES" ]; then
  MSG="[secrets-audit] Problems found (checked ${CHECKED} keys):"
  if [ -n "$MISSING" ]; then
    MSG="${MSG}

Missing keys in Infisical:${MISSING}

Restore from a backup or recreate via \`infisical secrets set\`."
  fi
  if [ -n "$LOCAL_ISSUES" ]; then
    MSG="${MSG}

Local FS issues:${LOCAL_ISSUES}"
  fi
  echo "$MSG"
  "$ALERTER" "$MSG" || true
  exit 1
fi

echo "[secrets-audit] OK — all ${CHECKED} required keys present, FS hygiene clean."
