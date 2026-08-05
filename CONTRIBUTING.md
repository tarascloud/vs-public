# Contributing

Thanks for looking. A few things worth knowing before you open a PR.

## How this repo is produced

Vibe Studio is developed in a private monorepo and published here through
`scripts/sync-to-public.sh`, which copies a curated file list, rewrites personal hosts and
identifiers to placeholders, and refuses to run if a secret pattern survives.

Practically, that means:

- **Pull requests are welcome and get merged upstream by hand**, then flow back here on the
  next sync. Your commit may therefore be squashed into a sync commit — the credit stays in
  the PR discussion and the changelog.
- **Do not expect a linear history.** Force-pushes to `main` are avoided but the tree is a
  projection of another repo, not its mirror.
- If a change is large, open an issue first so it can be applied upstream in one piece.

## Good first contributions

- **Translations.** Agent prompts in `agents/` and several docs are Ukrainian. English
  versions (`agents/en/<name>.md`) are the single most useful thing anyone could add.
- **Deployment recipes.** The stack assumes Docker on a single host. Compose files or charts
  for other setups (Fly, Railway, k8s) belong in `infra/`.
- **Swapping the author's integrations for generic ones** — Infisical for `.env`, Cloudflare
  Tunnel for a plain reverse proxy, Synology rsync for S3.

## Development

```bash
cp .env.example .env
docker compose up -d pg redis
cd app && npm ci && npx prisma generate && npx prisma db push && npm run dev
```

The check that must pass — CI enforces exactly this one:

```bash
cd app && npm run build
```

Lint and unit tests are **already failing on `main`** (24 ESLint `no-explicit-any` errors, 10
vitest cases whose `@/lib/auth-helpers` mocks predate the `verifyInternalSecret` export). CI runs
them with `continue-on-error` so the signal is visible without blocking every PR. Please do not
add new failures, and PRs that shrink those numbers are very welcome:

```bash
cd app
npm run lint
npm test              # vitest
npx playwright test   # E2E, needs a running app and a seeded database
```

## Rules that are not negotiable

These exist because breaking them has cost production time before:

1. **Every API route authenticates.** Use `requireOwner()` / `requireAuth()` from
   `app/src/lib/auth-helpers.ts`. Public webhooks authenticate with a secret header compared
   using `timingSafeEqual`, never a query parameter.
2. **No `dangerouslySetInnerHTML` without `sanitizeHtml()`** from `app/src/lib/sanitize-html.ts`.
3. **Never remove `'unsafe-inline'` from `script-src`** without shipping nonce-based CSP in the
   same change — Next.js injects inline bootstrap scripts and the UI silently goes blank.
4. **No secrets in commits.** Not in code, not in tests, not in fixtures that look real.

## Reporting security issues

Please do not open a public issue for a vulnerability. Use GitHub's private security advisory
form on this repository instead.

## License

Contributions are accepted under [AGPL-3.0](LICENSE), the license of this project.
