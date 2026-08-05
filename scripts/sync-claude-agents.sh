#!/usr/bin/env bash
# sync-claude-agents.sh — REV22-019 / REV22-020
#
# Syncs agents/*.md (all agent definition files) into
# ~/.claude/agents/ on the current host. Creates symlinks so edits in the
# repo are immediately reflected without a separate copy step.
#
# Usage:
#   bash scripts/sync-claude-agents.sh [--copy] [--dry-run] [--check]
#
#   --copy     Copy files instead of symlinking (e.g. for Mac where CWD path differs)
#   --dry-run  Print what would happen, do not change anything
#   --check    Drift-audit mode: report any agents in ~/.claude/agents/ that differ
#              from agents/ (or are absent). Exit 1 if drift found.
#
# Daily drift-audit (add to crontab on VPS):
#   30 7 * * * /opt/repos/vibe-studio/scripts/sync-claude-agents.sh --check \
#     >> /opt/docker/logs/agent-drift.log 2>&1 || \
#     curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
#       -d "chat_id=100000000" \
#       --data-urlencode "text=WARNING: ~/.claude/agents/ drift from agents/" > /dev/null
#
# REV22-020 addendum: agents ai, trainer, voice are registered here so they
# appear as valid subagent_type values for the Agent tool. They previously
# existed only in agents/ and were invisible to Claude Code dispatch.

set -euo pipefail

REPO_AGENTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/agents"
CLAUDE_AGENTS_DIR="${HOME}/.claude/agents"
COPY_MODE=0
DRY_RUN=0
CHECK_MODE=0

for arg in "$@"; do
    case "$arg" in
        --copy)    COPY_MODE=1 ;;
        --dry-run) DRY_RUN=1 ;;
        --check)   CHECK_MODE=1 ;;
    esac
done

if [ ! -d "$REPO_AGENTS_DIR" ]; then
    echo "[ERROR] Repo agents dir not found: $REPO_AGENTS_DIR" >&2
    exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] REPO_AGENTS_DIR=$REPO_AGENTS_DIR"
    echo "[dry-run] CLAUDE_AGENTS_DIR=$CLAUDE_AGENTS_DIR"
fi

mkdir -p "$CLAUDE_AGENTS_DIR"

DRIFT=0
SYNCED=0
SKIPPED=0

# Enumerate all agent definition files in the repo
while IFS= read -r -d '' src_file; do
    filename="$(basename "$src_file")"
    dst_file="$CLAUDE_AGENTS_DIR/$filename"

    if [ "$CHECK_MODE" -eq 1 ]; then
        # Drift-audit: compare repo vs installed
        if [ ! -e "$dst_file" ]; then
            echo "[DRIFT-MISSING] $filename not in ~/.claude/agents/"
            DRIFT=$((DRIFT + 1))
        elif [ -L "$dst_file" ]; then
            # Symlink: check it points to the right target
            actual_target="$(readlink "$dst_file")"
            if [ "$actual_target" != "$src_file" ]; then
                echo "[DRIFT-SYMLINK] $filename → $actual_target (expected $src_file)"
                DRIFT=$((DRIFT + 1))
            fi
        else
            # Regular file: diff content
            if ! diff -q "$src_file" "$dst_file" > /dev/null 2>&1; then
                echo "[DRIFT-CONTENT] $filename differs from repo version"
                DRIFT=$((DRIFT + 1))
            fi
        fi
        continue
    fi

    if [ "$COPY_MODE" -eq 1 ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            echo "[dry-run] cp $src_file $dst_file"
            SYNCED=$((SYNCED + 1))
        else
            cp "$src_file" "$dst_file"
            echo "[copy] $filename → $dst_file"
            SYNCED=$((SYNCED + 1))
        fi
    else
        # Symlink mode (default on VPS where paths are stable)
        if [ -L "$dst_file" ] && [ "$(readlink "$dst_file")" = "$src_file" ]; then
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
        if [ "$DRY_RUN" -eq 1 ]; then
            echo "[dry-run] ln -sf $src_file $dst_file"
            SYNCED=$((SYNCED + 1))
        else
            # Remove old file/symlink if present
            [ -e "$dst_file" ] && rm -f "$dst_file"
            ln -sf "$src_file" "$dst_file"
            echo "[symlink] $filename → $src_file"
            SYNCED=$((SYNCED + 1))
        fi
    fi
done < <(find "$REPO_AGENTS_DIR" -maxdepth 1 -name "*.md" -print0 | sort -z)

if [ "$CHECK_MODE" -eq 1 ]; then
    # Also report ~/.claude/agents/ files NOT in repo (stale)
    while IFS= read -r -d '' dst_file; do
        filename="$(basename "$dst_file")"
        src_file="$REPO_AGENTS_DIR/$filename"
        if [ ! -f "$src_file" ]; then
            echo "[DRIFT-STALE] $filename in ~/.claude/agents/ but not in agents/"
            DRIFT=$((DRIFT + 1))
        fi
    done < <(find "$CLAUDE_AGENTS_DIR" -maxdepth 1 -name "*.md" -print0 | sort -z)

    DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [ "$DRIFT" -gt 0 ]; then
        echo "[$DATE] DRIFT-DETECTED drift_count=$DRIFT"
        exit 1
    else
        echo "[$DATE] OK no drift ($(find "$REPO_AGENTS_DIR" -maxdepth 1 -name "*.md" | wc -l) agents synced)"
        exit 0
    fi
fi

DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[$DATE] Done: synced=$SYNCED skipped(up-to-date)=$SKIPPED"
echo ""
echo "NOTE: Run this script on BOTH Mac and VPS after adding or renaming agents."
echo "REV22-020: ai.md, trainer.md, voice.md are now included — these agents"
echo "are available as subagent_type: ai/trainer/voice for the Agent tool."
