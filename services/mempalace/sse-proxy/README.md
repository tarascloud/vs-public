# SSE Bridge (archived)

Disabled 2026-04-11 via MP-IMPROVE-20260411-10-kill: no documented consumer, SEC-01 dual-writer risk.

To revive:
1. Uncomment mempalace-sse section in infra/docker-compose.yml (see git history for last active version)
2. Re-add UFW rules for 8032 (LAN + Tailscale)
3. Verify bearer token auth still works
4. Update CLAUDE.md §MemPalace MCP section

Last active commit: 90cc9dc3
