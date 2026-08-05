# VS API Authentication Patterns

## Session-based auth (browser users)

All API routes use `requireAuth()` or `requireOwner()` from `@/lib/auth-helpers.ts`.
These functions check the NextAuth session cookie and return the user object.

- `requireAuth()` — any authenticated user (OWNER, CLIENT)
- `requireOwner()` — only OWNER role

## Internal service-to-service auth (agents, workers)

Claude Code subagents and internal services (SH worker, scheduler, etc.) do not have
a browser session. They authenticate via the `x-internal-secret` HTTP header.

### How it works

Each route that supports internal auth calls `validateInternalSecret(request)` which:

1. Reads `x-internal-secret` header from the request
2. Compares it against `INTERNAL_API_SECRET` env var using `crypto.timingSafeEqual()`
3. Returns `true` if they match (timing-safe to prevent timing attacks)

### Supported endpoints

| Method | Path | Session auth | Internal secret |
|--------|------|-------------|----------------|
| GET | `/api/tasks` | requireAuth | x-internal-secret |
| POST | `/api/tasks` | requireOwner | x-internal-secret |
| GET | `/api/tasks/[id]` | requireAuth | - |
| PUT | `/api/tasks/[id]` | requireAuth | x-internal-secret |
| DELETE | `/api/tasks/[id]` | requireOwner | - |

### Usage from agents

```bash
curl -X POST https://vibe-studio.example.com/api/tasks \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: $INTERNAL_API_SECRET" \
  -d '{"title": "...", "initiativeId": "...", "agentId": "..."}'
```

```bash
curl -X PUT https://vibe-studio.example.com/api/tasks/$TASK_ID \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: $INTERNAL_API_SECRET" \
  -d '{"status": "IN_PROGRESS"}'
```

### Security notes

- `INTERNAL_API_SECRET` is stored in Infisical, injected via `.vs.env`
- Timing-safe comparison prevents timing side-channel attacks
- Internal auth bypasses role checks (equivalent to OWNER access)
- DELETE remains OWNER-only (no internal bypass) to prevent accidental deletion
