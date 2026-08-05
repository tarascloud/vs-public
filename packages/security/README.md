# @vibe-studio/security

Shared security utilities for the Owner Cloud monorepo — PD, JF, SH, VS, KO.

**Status:** Scaffold (v0.1.0). Not yet wired as an npm workspace. Each
consumer project still imports from its own `lib/`. See
[docs/adr/shared-security-utils.md](../../docs/adr/shared-security-utils.md)
for the migration plan.

## Modules

| Import path | Purpose |
|-------------|---------|
| `@vibe-studio/security/sanitize-html` | Isomorphic DOMPurify with safe defaults + SVG schema variant |
| `@vibe-studio/security/rate-limit` | Sliding-window rate limiter (Cloudflare-aware IP detection) |
| `@vibe-studio/security/auth-helpers` | `requireAuth()` / `requireOwner()` for NextAuth v5 |

## Usage (target state, post-migration)

```ts
// API route
import { requireOwner } from "@vibe-studio/security/auth-helpers";
import { rateLimitOrNull } from "@vibe-studio/security/rate-limit";
import { sanitizeHtml } from "@vibe-studio/security/sanitize-html";

export async function POST(req: Request) {
  const limited = await rateLimitOrNull("admin:update", { limit: 30 });
  if (limited) return limited;

  const owner = await requireOwner();
  if (!owner) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { html } = await req.json();
  const safe = sanitizeHtml(html);
  // ...
}
```

## Why this package exists

Four projects (PD, JF, SH, VS) had four **different** implementations of
the same three utilities. A Security Review in 2026-04 found:

- VS `sanitize-html` allowed `<img>` and `<div>` — enabled tracking pixels
- JF `sanitize-html` used a different npm package (`sanitize-html` vs `dompurify`)
- Auth helpers diverged: some threw, some returned null, some returned
  booleans — routes copy-pasted the "wrong" variant and introduced auth
  gaps (fixed in separate tickets, tracked in MemPalace).

Centralizing them kills the divergence and makes security patches
deploy once → protect everywhere.

## Migration plan (for consumers)

See [docs/adr/shared-security-utils.md](../../docs/adr/shared-security-utils.md).
TL;DR:

1. pnpm workspace: add `packages/security` to `pnpm-workspace.yaml`.
2. Each consumer: add `"@vibe-studio/security": "workspace:*"` to `package.json`.
3. Codemod: replace `@/lib/sanitize-html` → `@vibe-studio/security/sanitize-html`,
   same for rate-limit and auth-helpers.
4. Delete per-project copies. Run tests.
5. Diff check: `git diff --stat` should show only import path changes.

## Tests

Tests live next to each module as `*.test.ts` (Vitest). Not yet extracted
— consumer-side tests in PD / SH are the current authority.

## Versioning

This is an internal package (`"private": true`). Breaking changes bump
minor version until 1.0.0; after 1.0.0, strict semver. Any change to
`sanitizeHtml` ALLOWED_TAGS / ALLOWED_ATTR is considered breaking.

## Security invariants

- `sanitizeHtml` MUST NOT allow `<style>`, `<script>`, `<iframe>`, `<img>`,
  `<div>`, `<hr>`, `data-*`, `style=""`, or `on*` event handlers.
- `sanitizeHtml` MUST enforce `rel="noopener noreferrer nofollow"` +
  `target="_blank"` on all external anchors.
- `rateLimitOrNull` MUST use `cf-connecting-ip` when behind Cloudflare
  (all projects are), otherwise `x-forwarded-for`.
- `requireAuth` / `requireOwner` MUST NOT return a user object if the
  email is absent from the session (prevents session-fixation style bugs
  where a session exists but is not linked to a user row).
