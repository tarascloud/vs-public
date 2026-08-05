# Security Utils Sync Rules

Until `@vibe-studio/security` package is extracted (ADR: `docs/adr/shared-security-utils.md`),
these rules keep security utilities consistent across projects.

## Canon versions

| Utility | Canon project | Canon file |
|---------|--------------|------------|
| `sanitizeHtml()` | **PD** | `pd-private/next/src/lib/sanitize-html.ts` |
| `sanitizeSchemaHtml()` | **SH** | `sh-private/src/lib/sanitize-html.ts` |
| `requireAuth/requireOwner` | **JF** | `jf-private/src/lib/auth-helpers.ts` (API pattern) |
| `checkRateLimit` | **PD** | `pd-private/next/src/lib/rate-limit.ts` (Redis-backed) |

## Mandatory rules (all projects)

### sanitize-html
- Library: `isomorphic-dompurify` (SSR-safe). NEVER use client-only `dompurify`.
- NEVER add `style` to ALLOWED_ATTR (CSS data exfiltration). See `feedback_security_recurring`.
- NEVER add `img` to ALLOWED_TAGS without explicit URI scheme enforcement (tracking pixels, onerror XSS).
- NEVER add `div` to ALLOWED_TAGS in user-content sanitizer (CSS injection surface when combined with class).
- ALWAYS include FORBID_ATTR: `["style", "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"]`.
- For SVG/diagram content: use `sanitizeSchemaHtml()` (SH pattern) with CSS scrubber — NEVER the base `sanitizeHtml()`.

### auth-helpers
- Every API route handler MUST call `requireAuth()` or `requireOwner()` before any data access.
- Return `{ error, user }` pattern (JF style) for API routes — NOT throw (PD style), NOT return null (VS style).
- Page/Server Component guards: redirect pattern (SH style) is acceptable.

### rate-limit
- Prefer Redis-backed (PD pattern) in production. In-memory is acceptable only for dev/single-instance.
- ALWAYS fail-open if Redis is unavailable — never block legitimate requests due to cache failure.
- Per-route configuration is mandatory for AI/sync endpoints (higher cost = lower limits).

## When modifying security utils in ANY project

1. Check if the change should apply to ALL projects
2. If yes: make the same change in all projects, or create a task to do so
3. If project-specific: document WHY in a comment
4. ALWAYS add/update tests when changing sanitizer behavior

## Known gaps to fix (tracked in REV-20260419-0007)

- [ ] VS: replace `dompurify` with `isomorphic-dompurify`, remove `img`/`div` from allowed tags
- [ ] JF: add FORBID_ATTR list (currently relies on library defaults)
- [ ] PD: add URI scheme enforcement (currently none)
- [ ] SH: add link rel hardening (nofollow noopener noreferrer on user links)
