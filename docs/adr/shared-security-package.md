# ADR: @vibe-studio/security — Shared Package Scaffold

**Date:** 2026-04-19
**Status:** SCAFFOLD (not yet wired)
**Task:** REV-20260419-0007
**Effort:** Scaffold S (<1h). Full migration XL (deferred).
**Related:** [shared-security-utils.md](./shared-security-utils.md) — review
that motivated this extraction.

## Summary

Create `packages/security/` scaffold inside `vs-private` to host the
canonical implementations of three security utilities duplicated across
four projects (PD, JF, SH, VS):

- `sanitize-html` — isomorphic DOMPurify with hardened defaults
- `rate-limit` — Cloudflare-aware sliding-window limiter
- `auth-helpers` — `requireAuth()` / `requireOwner()` for NextAuth v5

This ADR documents the **scaffold**. A follow-up ADR will cover the
actual migration, which requires:
- pnpm (or npm) workspace setup across 4 repos (currently each repo is
  self-contained — they don't know about each other)
- Codemod to rewrite imports
- Visual + security regression suite

## What the scaffold delivers

```
packages/security/
  package.json          # name "@vibe-studio/security", v0.1.0, peerDeps
  README.md             # usage + migration plan
  src/
    sanitize-html.ts    # canonical DOMPurify config (no <img>, no <div>, URI allowlist)
    rate-limit.ts       # sliding-window limiter (same as vs-private)
    auth-helpers.ts     # requireAuth / requireOwner + OrThrow variants
    index.ts            # re-exports
```

## Canonical decisions baked into the scaffold

Per `shared-security-utils.md` review:

1. **sanitize-html:** use `isomorphic-dompurify` (SSR-safe). Drop `<img>`
   and `<div>` from ALLOWED_TAGS. Enforce URI regexp (http/https/mailto
   only). Add second-pass link hardening (`rel="noopener noreferrer nofollow"`
   on all external anchors). Provide separate `sanitizeSchemaHtml` for
   SVG diagrams (Shuleansky use case).

2. **rate-limit:** start with in-memory implementation (matches current
   vs-private behavior). Add TODO marker to migrate to Redis backend
   before production roll-out to JF (which has multi-request scrape jobs).

3. **auth-helpers:** RETURN-OR-NULL pattern as primary, with
   `*OrThrow()` variants for server actions. Scaffold uses
   `@/auth` and `@/lib/prisma` path aliases that each consumer resolves
   locally — real migration will invert this via
   `createAuthHelpers({ auth, prisma })` factory.

## Migration path (not executed in this scaffold)

Phase 1 — workspace setup (1 day):
- Choose monorepo tool: pnpm workspaces (lightest) or Turborepo (if we
  want remote cache).
- Decision: **pnpm workspaces**. All projects are already pnpm-compatible;
  no need for Turborepo caching (builds are on VPS, not CI fan-out).
- Create `pnpm-workspace.yaml` at `/opt/repos/vibe-studio/` root (or
  inside vs-private). Add `packages/*` glob.

Phase 2 — consumer wiring (1 day per project):
- Add `"@vibe-studio/security": "workspace:*"` to each consumer
  `package.json`.
- For `auth-helpers`: refactor from path-alias-assumption to
  DI-factory pattern so each consumer passes its own `auth()` and
  `prisma`. This is the only non-trivial code change.

Phase 3 — codemod (2 hours):
- jscodeshift script to rewrite `@/lib/sanitize-html` →
  `@vibe-studio/security/sanitize-html` (same for rate-limit/auth-helpers).
- Run per-repo, commit separately.

Phase 4 — regression suite (1 day):
- XSS payload corpus (OWASP XSS-filter-evasion cheatsheet) against
  `sanitizeHtml` in isolated test.
- Load test rate-limiter under concurrent writes.
- Integration test auth-helpers against real NextAuth session fixture.

Phase 5 — delete duplicates + monitoring (0.5 day).

## Rollout order (risk-first)

1. **VS** — lowest traffic, internal tool. Burn-in for 1 week.
2. **SH** — second lowest, tight user set.
3. **JF** — medium traffic, external users. Requires Redis rate limiter.
4. **PD** — highest traffic, daily user. Only migrate after (1)-(3) green.

## Why scaffold first

Full migration across 4 repos is XL and risky. A scaffold:
- Captures the canonical decisions **now**, before memory fades.
- Gives a concrete target for each consumer to pattern-match against.
- Unblocks the review backlog (REV-20260419-0007) without the
  coordination cost of full migration.
- Can be iterated independently (e.g. add Redis rate-limit backend)
  before the first consumer adopts.

## Risks

| Risk | Mitigation |
|------|------------|
| Scaffold drifts from consumer implementations over time | Review ADR every quarter until Phase 5 completes |
| `@ts-expect-error` in auth-helpers.ts hides real bugs until DI refactor | Tracked in TODO inside the file; cannot ship this to npm as-is |
| Consumers pick up scaffold code via copy-paste, not import, defeating the point | Commit message + README explicitly say "do not copy — wait for workspace setup" |

## References

- Review: `docs/adr/shared-security-utils.md` (full implementation diff across 4 repos)
- Review: `docs/adr/shared-ui-components.md` (companion extraction)
- MemPalace: feedback_security_recurring, feedback_prisma7_build_issues

---

## Update 2026-05-13 — REV-08-PHASE-D-{2..6} blocker (defer)

Tasks REV-08-PHASE-D-2-PD / -3-JF / -4-SH / -5-KO / -6-BP requested consuming
`@vibe-studio/security` from PD, JF, SH, KO, BP **via GitHub Packages**.

### Why deferred (consumer side)

The package is **scaffold only** and is **not published anywhere yet**:

1. `packages/security/package.json` has `"private": true` and `v0.1.0` —
   never published to npm / GitHub Packages.
2. No `.github/workflows/publish.yml` exists in vs-private — nothing
   builds + pushes the package to GHCR/npm Registry.
3. The 5 target repos are **separate git repositories**, not workspace
   members. None of them has an `.npmrc` pointing at GHCR or a workspace
   `pnpm-workspace.yaml` reference.
4. Even within vs-private, only `app/package.json` consumes a sibling
   package and only via `"file:../packages/tailwind-preset"` — not via
   a registry.
5. The original ADR plan (this file, Phase 1) is **pnpm workspaces**, not
   GitHub Packages. The two paths require different infrastructure:
   - **pnpm workspaces:** single git repo / monorepo, `workspace:*`
     protocol, no registry needed. Blocks on co-locating 5 separate
     repos into one tree.
   - **GitHub Packages:** publish workflow + private registry auth in
     every consumer Docker build (`NPM_TOKEN` build-arg, `.npmrc`).
     Blocks on publish workflow + secret distribution.

### Current state (sufficient until package extraction)

Per-project security utilities are **already aligned with the scaffold
canon** through `.claude/rules/security-sync.md`:

| Project | sanitize-html | rate-limit | auth-helpers |
|---------|---------------|------------|--------------|
| PD | aligned to canon (isomorphic-dompurify, BASE_TAGS) | Redis canon | `lib/current-user.ts` (throws) |
| JF | aligned to canon (replaced npm `sanitize-html`) | `rate-limit-redis.ts` canon copy | `auth-helpers.ts` (return-object) |
| SH | aligned + `sanitizeSchemaHtml` extension | in-memory + `rate-limit.ts` | `auth-helpers.ts` (redirect + api) |
| KO | (no user-HTML rendering — N/A) | `rate-limit-redis.ts` canon copy | `auth-helpers.ts` |
| BP | (no user-HTML rendering — N/A) | `rate-limit-redis.ts` canon copy | `auth-helpers.ts` |

Daily security risk is **bounded** — sync rules + per-file pointer
comments to this ADR keep drift visible during code review.

### Pre-conditions before consuming via GitHub Packages

In rough order:

1. **Publish workflow.** Add `.github/workflows/publish-security.yml` in
   vs-private that, on tag `security-vX.Y.Z`:
   - Builds the package (TypeScript → dist).
   - Publishes to `npm.pkg.github.com` with scope `@owner-cloud`.
   - Requires `packages: write` token permission and a
     `package.json` change setting `"private": false` (or use
     `--access restricted` with PAT).
2. **Compile to JS.** Current `package.json` has `"types": "./src/index.ts"`
   and `"default": "./src/index.ts"` — bare TS exports won't work for
   downstream Next.js builds without `transpilePackages`. Add tsup or
   tsc build step producing `dist/` (CJS + ESM + .d.ts).
3. **Auth in every consumer Docker build.** Each consumer Dockerfile
   needs `ARG NPM_TOKEN`, an `.npmrc` file with
   `//npm.pkg.github.com/:_authToken=${NPM_TOKEN}` and
   `@owner-cloud:registry=https://npm.pkg.github.com`. The token must
   have `read:packages` scope.
4. **DI refactor for auth-helpers.** The scaffold imports `@/auth` and
   `@/lib/prisma` via path aliases — this assumes a co-located project.
   Package consumers cannot resolve those aliases. Refactor to
   `createAuthHelpers({ auth, prisma })` factory before publishing.
5. **Codemod per repo.** jscodeshift to rewrite
   `@/lib/sanitize-html` → `@vibe-studio/security/sanitize-html`,
   same for `rate-limit*` and `auth-helpers`. Run per-repo, commit
   separately. Verify with `npm run build` and `npm test`.
6. **Delete per-project copies** only after the new import path renders
   identical bytes in the build output.

### What landed in 5 release branches (REV-08-PHASE-D-{2..6})

Each of the 5 target repos got a release branch with:

- A single-line TODO comment at the top of one security helper file
  pointing at this ADR section (so future maintainers see the
  scaffold-vs-package state in their IDE without reading the ADR).
- No code change beyond the comment. Public API unchanged. Build green.

Branches (all push-only, NOT merged):

| Repo | Branch | Commit (one TODO comment) |
|------|--------|---------------------------|
| pd-private | `release-2026-05-13-pd-consume-security` | `next/src/lib/sanitize-html.ts` |
| jf-private | `release-2026-05-13-jf-consume-security` | `src/lib/sanitize-html.ts` |
| sh-private | `release-2026-05-13-sh-consume-security` | `src/lib/sanitize-html.ts` |
| korobkovart | `release-2026-05-13-ko-consume-security` | `site/src/lib/auth-helpers.ts` |
| bp-private | `release-2026-05-13-bp-consume-security` | `src/lib/auth-helpers.ts` |

This mirrors the pattern used by REV-20260512-011 for design-tokens:
document the blocker on disk where the consumer's eyes are, defer the
mechanical refactor until the publish + workspace prerequisites land.
