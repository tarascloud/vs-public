# VS CSS Tokens — Divergence from shadcn Canon

**Source:** DES-20260601-0004 (review 2026-06-01)
**Decision:** VS keeps custom token names (`--accent`, `--card-bg`,
`--foreground-secondary`, etc.). VS is **excluded** from the planned
`@vibe-studio/ui` shared package.

## Token mapping

The VS `globals.css` (`src/app/globals.css`) defines tokens that do not
match the shadcn/ui canon used by PD, JF, SH, KO via the shared package.

| VS token                  | shadcn equivalent              | Used for |
|---------------------------|--------------------------------|----------|
| `--accent`                | `--primary`                    | Indigo-500 brand primary (CTAs, links) |
| `--accent-hover`          | hover state of `--primary`     | Indigo-400 |
| `--accent-active`         | pressed state of `--primary`   | Indigo-600 |
| `--accent-subtle`         | `--accent` (≈10% opacity bg)   | Subtle accent surfaces |
| `--accent-border`         | `--accent` (≈20% opacity)      | Soft brand borders |
| `--card-bg`               | `--card`                       | Card background |
| `--card-bg-hover`         | (no canon equivalent)          | Card hover state |
| `--card-border`           | `--border`                     | Default border |
| `--card-border-hover`     | (no canon equivalent)          | Border hover state |
| `--foreground-secondary`  | one step above `--muted-foreground` | Secondary text |

## Rationale

1. **Brand identity.** VS is a marketing/studio surface with strong
   indigo-violet brand identity on `#09090b` background. The naming
   `--accent` semantically reflects "brand accent color" rather than
   shadcn's looser "subtle hover surface".

2. **Blast radius.** ~612 utility usages (`bg-accent`, `text-accent`,
   `border-card-border`, `hover:bg-accent-hover`, etc.) across
   `src/app/**`, `src/app/studio/**`, components and admin surfaces.
   A rename would touch hundreds of files purely for naming alignment
   with negligible UX win. This conflicts with the Karpathy
   "Surgical Changes" principle (`.claude/rules/karpathy-coding.md`).

3. **Precedent.** KO has the same divergence and is exempt — see
   `.claude/rules/css-tokens-sync.md` §"KO `--accent` exception". The
   rationale (gallery brand, not SaaS dashboard) applies here too:
   VS Studio Kanban is a brand-forward surface, not a generic dashboard.

## Consequence for `@vibe-studio/ui` extraction

When the shared package is extracted, **VS is not a consumer**:

- VS keeps its own `Button`, `Card`, `EmptyState`, etc. primitives bound
  to local `--accent`/`--card-bg`/`--card-border` tokens.
- If a component is later moved into the shared package and reused by VS,
  it must be re-bound at the call site (or via a token override layer
  in `globals.css`) from `--primary`/`--card`/`--border` to the VS
  semantic.

## Do not

- Do **not** copy VS's `--accent` value (indigo-500) into the PD canon
  where `--accent` means "subtle hover surface". They are different
  semantic spaces.
- Do **not** rewire VS tokens to shadcn canon without a coordinated
  refactor across all ~612 callsites and a parallel UX review.
- Do **not** add VS to the `css-tokens-sync.md` "Shared components"
  table without first reconciling tokens — components like `EmptyState`
  use neutral `bg-muted`/`text-muted-foreground` so they cross the
  boundary safely.

## What is shared

The following primitives can be safely shared from VS to other projects
(or vice versa) because they use neutral tokens that exist in both
spaces:

- `EmptyState` — uses `bg-muted`/`text-muted-foreground`/`text-foreground`
  (canon API mirrored 2026-06-01, see DES-20260601-0006).

Future shared primitives must follow the same rule: use only tokens
that exist in BOTH semantic spaces, or expose a `theme` prop.
