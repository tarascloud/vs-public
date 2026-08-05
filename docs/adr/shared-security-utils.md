# ADR: @vibe-studio/security — Shared Security Utilities

**Date:** 2026-04-19
**Status:** PROPOSED
**Task:** REV-20260419-0007
**Effort:** XL (cross-repo extraction, security-critical)

## Context

Three security-critical utilities are duplicated across 4 projects (PD, JF, SH, VS) with **different implementations and different security postures**. This is the most dangerous duplication because a fix in one project does not propagate to others.

### 1. sanitize-html — 4 implementations, 3 different libraries

| Project | Library | ALLOWED_TAGS | ALLOWED_ATTR | Extra hardening |
|---------|---------|-------------|-------------|-----------------|
| **PD** | `isomorphic-dompurify` | 23 tags | 6 attrs (global list) | None |
| **JF** | `sanitize-html` (npm) | 29 tags | per-tag allowlist | `transformTags` (force rel on links), `allowedSchemes` |
| **SH** | `isomorphic-dompurify` | FORBID_TAGS approach | 6 attrs + explicit FORBID_ATTR | URI regexp, CSS scrubber, `sanitizeSchemaHtml()` for SVG |
| **VS** | `dompurify` (client-only) | 28 tags (includes `img`, `div`, `hr`) | 6 attrs, `ALLOW_DATA_ATTR: false` | None |

**Key differences:**

| Aspect | PD | JF | SH | VS |
|--------|:--:|:--:|:--:|:--:|
| SSR-safe | Yes (isomorphic) | Yes (no DOM needed) | Yes (isomorphic) | **NO** (client dompurify) |
| Blocks `<img>` | Yes | Yes | Yes | **NO** (allows img) |
| Blocks `<div>` | Yes | Yes | Yes | **NO** (allows div) |
| Blocks `<hr>` | Yes | **NO** | Yes | **NO** |
| URI scheme enforcement | No | Yes (http/https/mailto) | Yes (custom regexp) | No |
| Link rel hardening | No | Yes (nofollow noopener) | No | No |
| CSS exfil protection | No | N/A (no style) | Yes (scrubCss) | No |
| SVG support | No | No | Yes (sanitizeSchemaHtml) | No |
| Has tests | Yes | No | Yes | No |

**Security concern:** VS allows `<img>` and `<div>` — `<img src=x onerror=alert(1)>` is blocked by ALLOWED_ATTR but `<img>` itself enables tracking pixels. VS also uses client-only `dompurify` which fails silently during SSR.

### 2. auth-helpers — 4 implementations, 3 different patterns

| Project | File | Pattern | Throws/Returns |
|---------|------|---------|----------------|
| **PD** | `lib/current-user.ts` | `requireUser()` / `requireOwner()` | **Throws** Error |
| **JF** | `lib/auth-helpers.ts` | `requireAuth()` / `requireOwner()` | Returns `{ error, user }` discriminated object |
| **SH** | `lib/auth-helpers.ts` | `requireAuth()` (redirect) + `requireAuthApi()` (JSON) + `requireOwnerApi()` | Page: redirect, API: Returns `{ authorized, response }` |
| **VS** | `lib/auth-helpers.ts` | `requireAuth()` / `requireOwner()` | Returns `user | null` |

**Four projects, four different return types.** This is not just code duplication — it is API inconsistency that causes developer confusion and copy-paste bugs.

### 3. rate-limit — 3 implementations, 2 backends

| Project | Backend | Key strategy | Window | Fail mode |
|---------|---------|-------------|--------|-----------|
| **PD** | Redis (sliding window) | `userId:endpoint:windowKey` | Configurable per-route (5-60 req/min) | Fail-open |
| **JF** | In-memory Map | `userId:action` or `ip:action` | 1 hour (user) / 1 min (IP) | N/A (in-process) |
| **VS** | In-memory Map | `prefix:ip` | Configurable (default 60/min) | N/A (in-process) |
| **SH** | None | — | — | — |

**PD's Redis-backed limiter is production-grade.** JF and VS have ad-hoc in-memory implementations that reset on deploy and don't work across multiple instances.

## Decision

Create `@vibe-studio/security` as a shared security utilities package.

### Package structure

```
packages/security/
  package.json
  src/
    sanitize-html.ts       # Canon sanitizer (isomorphic-dompurify)
    sanitize-schema.ts     # SVG/diagram sanitizer (from SH)
    auth-helpers.ts        # Unified auth helper factory
    rate-limit.ts          # Redis-backed rate limiter (from PD)
    rate-limit-memory.ts   # In-memory fallback (for dev/test)
    types.ts               # Shared types
  index.ts
  __tests__/
    sanitize-html.test.ts  # Merged from PD + SH tests
```

### Canon implementations

#### sanitize-html (canon: merge of PD + SH)

- **Library:** `isomorphic-dompurify` (SSR-safe, DOM-aware)
- **ALLOWED_TAGS:** PD's list (23 tags) — no `img`, no `div`, no `hr`
- **ALLOWED_ATTR:** `["href", "src", "alt", "class", "target", "rel"]` — NO `style`
- **FORBID_ATTR:** `["style", "onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"]` (from SH)
- **URI enforcement:** SH's `SAFE_URI_REGEXP` (blocks javascript:, data:, vbscript:)
- **Export `sanitizeSchemaHtml()`** separately for SVG content (from SH, with CSS scrubber)
- **JF's `transformTags`** (force rel on links) — implement as a DOMPurify hook, not a separate library

#### auth-helpers (canon: factory pattern)

```typescript
// Unified factory — each project provides its own auth() and prisma
export function createAuthHelpers(config: {
  getSession: () => Promise<Session | null>;
  findUser?: (email: string) => Promise<User | null>;
}) {
  return {
    requireAuth: async () => { /* ... */ },
    requireOwner: async () => { /* ... */ },
    requireAuthApi: async () => { /* returns { error, user } */ },
    requireOwnerApi: async () => { /* returns { error, user } */ },
  };
}
```

This lets each project inject its own `auth()` and `prisma` while sharing the guard logic.

#### rate-limit (canon: PD's Redis implementation)

- **Primary:** Redis-backed sliding window (from PD)
- **Fallback:** In-memory Map for projects without Redis (from VS, with pruning)
- **Factory:** `createRateLimiter({ redis?: RedisClient })` — auto-selects backend
- **Per-route config:** keep PD's `ROUTE_LIMITS` pattern, make it extensible

### Migration plan

| Phase | Description | Effort | Risk |
|-------|-------------|--------|------|
| 1 | Create `packages/security/` with canon sanitize-html + tests | M | Low |
| 2 | Replace PD sanitize-html with import, run existing tests | S | Low |
| 3 | Replace SH sanitize-html (keep sanitizeSchemaHtml) | S | Low |
| 4 | Replace VS sanitize-html (**BREAKING: removes img/div/hr, adds SSR**) | M | Medium |
| 5 | Replace JF sanitize-html (**BREAKING: changes library from sanitize-html to DOMPurify**) | M | Medium |
| 6 | Add auth-helpers factory, migrate PD | M | Medium |
| 7 | Migrate JF/SH/VS auth-helpers | M | Medium |
| 8 | Extract rate-limit, add Redis adapter | M | Low |

### Priority

**This package should be extracted BEFORE `@vibe-studio/ui`** because:
1. Security utilities have the highest blast radius if they diverge
2. They have no visual regression risk (pure logic)
3. The current VS implementation has a concrete security gap (client-only dompurify, allows img)

## Risks

- **JF uses a different sanitize library** (`sanitize-html` npm vs `isomorphic-dompurify`). Migration changes behavior — needs thorough testing with real vacancy HTML.
- **VS allows `<img>`** — removing it may break existing rendered content. Need to audit what content VS actually sanitizes.
- **Auth helper return types differ** — migration requires updating callsites. Use the factory pattern to minimize changes.

## Alternatives considered

1. **Keep separate, add CI diff-check** — insufficient for security-critical code
2. **Shared eslint rules only** — doesn't prevent implementation drift
3. **Copy-paste with manual sync** — current approach, proven to fail (4 different implementations)

## Consequences

- Single security posture across all projects
- Security fixes propagate automatically via package update
- VS's sanitizer gap (client-only dompurify, allows img) gets fixed
- Tests from PD and SH are merged into comprehensive suite

---

## Update 2026-05-07 — Phase 1 partial extraction (ARC-20260507-0001/0004)

Rather than wait for the full `packages/security/` workspace package, we
extracted the **rate-limit Redis canon** into a `rate-limit-redis.ts`
file copied verbatim into vs-private, jf-private, korobkovart. This is a
pre-package step: the file is byte-identical across projects (only the
namespace constant differs: `vs:rl`, `jf:rl`, `ko:rl`) so when the
package is created the file moves directly into `packages/security/src/`
with no logic changes.

### What landed

| Project | File | Namespace | Public API preserved |
|---------|------|-----------|----------------------|
| vs-private | `app/src/lib/rate-limit-redis.ts` | `vs:rl` | yes (`rateLimitOrNull`, `checkRateLimit`) |
| jf-private | `src/lib/rate-limit-redis.ts` | `jf:rl` | yes (`checkRateLimit`, `checkIpRateLimit`) |
| korobkovart | `site/src/lib/rate-limit-redis.ts` | `ko:rl` | yes (`checkRateLimit`, `getClientIp`) |

PD already used Redis directly — it does **not** import the new canon
file (yet). When the package is extracted, PD's `rate-limit.ts` is
replaced with `import { slidingWindow } from "@vibe-studio/security"`.

### Why a per-project copy and not a real package now

1. **Surface area minimised.** No `npm workspaces` retrofit, no Docker
   build context changes for 3 services, no per-project `package.json`
   churn during a security-rev. (Karpathy: surgical changes.)
2. **Backward compat preserved.** Existing callers stayed unchanged.
   The Redis path is opt-in via `REDIS_URL`/`REDIS_PASSWORD`; ioredis is
   imported dynamically so projects without the dep keep building.
3. **Fail-open posture inherited from PD canon.** Distributed rate limit
   enforcement is a hardening layer — auth + Zod validation remain the
   primary defenses. The unknown-IP edge in KO is the one fail-CLOSED
   exception (ARC-20260507-0003): all anonymous traffic shares the
   `global-fallback` bucket so header-stripping no longer bypasses.

### Sync rules (until package extracted)

Add to `.claude/rules/security-sync.md`:

> **rate-limit-redis.ts is canon.** When changing the limiter algorithm,
> Redis key format, or fail-open semantics, change ALL FOUR projects in
> the same release branch (PD via `rate-limit.ts`, VS/JF/KO via
> `rate-limit-redis.ts`). Diff regularly:
> ```
> for repo in app jf-private korobkovart/site; do
>   diff -q pd-private/next/src/lib/redis-related-canon \
>           $repo/src/lib/rate-limit-redis.ts
> done
> ```
> Drift is a regression — open a CHORE task to re-sync.

### Phase 2 next steps (deferred — awaits owner review)

1. Add `ioredis` to `app/package.json`,
   `jf-private/package.json`, `korobkovart/site/package.json`.
2. Set `REDIS_URL` (or `REDIS_HOST`+`REDIS_PASSWORD`) in each Docker env
   so the Redis path activates in prod.
3. Migrate at least one /api route per project to use the async Redis
   variant (`checkRateLimitAsync`, `slidingWindow`) directly to validate
   end-to-end.
4. Once all four projects share the file byte-for-byte, lift it into
   `packages/security/src/rate-limit.ts` and replace the
   per-project copies with `import { slidingWindow } from
   "@vibe-studio/security/rate-limit"`.

### Open questions for owner

- Approve adding `ioredis` to all 3 projects (≈400KB install per image)?
- KO is a low-traffic gallery — is sharing prod Redis with PD acceptable
  for `ko:rl` keys? Alternative: per-project Redis databases (DB 0/1/2
  via REDIS_URL `?db=N`). PD is already on DB 0; VS uses Redis on the
  shared pg/redis stack.
- Should `requireAuthApi`/`requireOwnerApi` adoption (ARC-20260507-0006)
  bundle with this package extraction or land separately first?

