# MCP host divergence (Mac vs VPS) — MP-DOCS-20260411-01

**Status:** enforced since MP-SEC-20260411-04
**Primary rule file:** `.claude/rules/mcp.md` (workspace root — synced via
baybay, NOT inside vs-private git). This doc is a pointer for Claude agents
working inside the vs-private repo so grep/glob can find the topic.

## TL;DR

- Mac and VPS have **intentionally different** `.mcp.json` files.
- `.mcp.json` is **NOT** in the baybay scp sync list.
- Secrets wrappers: `~/.local/bin/infisical-mcp-{mac,vps}` per host.
- Infisical paths: `/mcp-mac` (Mac), `/mcp-vps` (VPS).
- Full rules and editing guidance: `.claude/rules/mcp.md`.

## Why we keep this in vs-private too

Agents running `grep -r mcp` inside `vs-private` (the most-common CWD for
development tasks) would otherwise never see the rule — workspace-level
`.claude/rules/` is not part of the vs-private repo tree. This stub keeps
the topic discoverable.

## Related

- `/opt/docker/scripts/mempalace-runner.sh` — SSH forced-command wrapper
  for mempalace MCP from Mac.
- `infra/scripts/mempalace-smoke.sh` — daily smoke test
  (MP-IMPROVE-20260411-15).
- `infra/scripts/mempalace-stats-update.sh` — live CLAUDE.md
  stats (MP-IMPROVE-20260411-14).
