# @vibe-studio/ui — Migration plan

Status as of REV-2026-06-01 (VS task `cmpvj4j56000v01lr9pkemph6`).

## What works today

- **VS app is linked** to `@vibe-studio/ui` via `file:../packages/ui` in
  `app/package.json` (workspace-style symlink). `npm install` succeeds;
  the symlink at `app/node_modules/@vibe-studio/ui → ../../../packages/ui`
  is created correctly.

## What does NOT work yet (blockers discovered during PoC)

A real import (`import { LocaleSwitcher } from "@vibe-studio/ui/locale-switcher"`)
was attempted from VS and `npx tsc --noEmit` immediately failed with:

```
../packages/ui/src/locale-switcher.tsx(18,40): error TS2307: Cannot find
  module 'class-variance-authority' or its corresponding type declarations.
../packages/ui/src/locale-switcher.tsx(85,5): error TS2875: This JSX tag
  requires the module path 'react/jsx-runtime' to exist...
```

Root cause: `packages/ui/` has no `node_modules/` of its own and the repo
is not configured as an npm workspace, so Node module resolution from
`packages/ui/src/locale-switcher.tsx` walks `packages/ui/node_modules` →
`packages/node_modules` → repo-root `node_modules` — all of which are
missing. Peer dependencies (`react`, `class-variance-authority`,
`@base-ui/react`, `clsx`, `tailwind-merge`, `lucide-react`) live only
inside `app/node_modules`, which is **above** the package in the
filesystem, so resolution from inside the package never reaches them.

This is a **package-wiring bug**, not a VS-side issue. The PoC import
was reverted to keep the worktree green; the `file:` link in
`app/package.json` is preserved so subsequent fix-the-package PRs can
land an import immediately.

Additional latent blockers in `packages/ui/`:

- `button.tsx`, `input.tsx`, `card.tsx`, `dialog.tsx`, `select.tsx` all
  `import { cn } from "@/lib/utils"`. The `@/*` path alias is
  **consumer-local**: it resolves against the consumer's `tsconfig.json`,
  not the package's. There is no `@/lib/utils` inside `packages/ui/`.
  The components compile only when the consumer happens to define
  `@/lib/utils` AND the consumer's bundler walks into
  `node_modules/@vibe-studio/ui/src/*.tsx` with the consumer's path
  alias active. That's brittle.
- `dialog.tsx` imports `@/components/ui/button` (consumer-local sibling).
- `peerDependencies` lists `@base-ui/react` 1.3+, `clsx`, `tailwind-merge`,
  `lucide-react` — **VS app does not have these installed**. PD has them.
  JF has some.
- The package's components use shadcn-style tokens (`--primary`,
  `--secondary`, `--destructive`, `--border`, `--input`, `--ring`).
  **VS uses different tokens** (`--accent`, `--accent-hover`,
  `--card-border`, etc., see `app/src/app/globals.css`).

## Concrete TODOs to unblock full migration

1. **Make `packages/ui` resolvable as a standalone package.** Either:
   - **(A)** Convert the repo to an npm workspace (root `package.json`
     with `"workspaces": ["app", "packages/*"]`) so peer deps hoist to
     a root `node_modules` reachable from the package. Lowest-friction.
   - **(B)** Add `dependencies` (not `peerDependencies`) to
     `packages/ui/package.json` for `react`, `react-dom`, `clsx`,
     `tailwind-merge`, `class-variance-authority`, `@base-ui/react`,
     `lucide-react`, then `npm install` inside `packages/ui/` so the
     package has its own `node_modules`. Heavier disk usage, but works
     without root workspace.
2. **Remove `@/lib/utils` imports from the package**: either export
   `cn` from the package itself (canonical) or inline
   `twMerge(clsx(...))` per file. Then `index.ts` should also export
   `cn`. Without this fix, every consumer must define `@/lib/utils`
   AND configure their bundler to apply that alias across
   `node_modules/@vibe-studio/ui/**`.
3. **Fix `dialog.tsx`**: replace
   `import { Button } from "@/components/ui/button"` with
   `import { Button } from "./button"`.
4. **VS-side decision (out of scope for this task)**: pick token
   strategy before migrating VS Button/Input/Card:
   - Map: add VS-side aliases (e.g. `--primary: var(--accent)`) so
     the PD-style tokens compile to VS colors. Low effort, doubles
     palette surface area.
   - Variant: extend `@vibe-studio/ui` with a token-pluggable system
     (CSS layer + token contract per consumer). Higher effort, cleaner.

## Migration order (per consumer)

PD → SH → JF → KO → **VS last**.

VS is last because:

1. VS has its own indigo/violet design system (`--accent`) that
   diverges from shadcn defaults (`--primary`).
2. VS uses raw `<button>` and `<input>` (not `@base-ui/react`).
   Migrating means adding `@base-ui/react` to VS deps and
   regression-testing the entire studio Kanban + admin UI.

## What was changed in this PR

- `app/package.json` — added `"@vibe-studio/ui": "file:../packages/ui"`.
  This **link is preserved**: it is a no-op at runtime (no file
  imports the package yet) but makes subsequent migration PRs trivial:
  they just need to fix the package wiring (TODO 1–3 above) and add
  imports.
- This file (`MIGRATION.md`) — captures concrete blockers so future
  migration agents do not have to re-derive them.

The VS Input / Button / Card / Dialog / Select components remain on
their local copies. They get the touch-target + contrast fixes from
sibling tasks (REV-2026-06-01) directly. Full @vibe-studio/ui adoption
is a follow-up P2 ticket gated on TODO 1–3.
