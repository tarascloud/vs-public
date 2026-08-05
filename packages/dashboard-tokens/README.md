# @vibe-studio/dashboard-tokens

Canonical shadcn/ui foundation tokens **plus** dashboard-specific semantic
tokens (income/expense, chart palettes, sleep/exercise colors, muscle
groups, UA/ES financial categories, landing page surfaces) shared by PD
and JF.

**Status:** Scaffold (v0.1.0). Not yet wired as an npm workspace — each
dashboard project still inlines the tokens in its own `globals.css`. See
[docs/adr/dashboard-tokens-package.md](../../docs/adr/dashboard-tokens-package.md)
for the migration plan.

## Relationship to `@vs/shared-tokens`

| Package | Scope | Consumers |
|---------|-------|-----------|
| `@vs/shared-tokens` | **Foundation** — bg/text/border/status primitives | ALL projects (VS, PD, JF, SH, KO) |
| `@vibe-studio/dashboard-tokens` | **Dashboard-specific** — shadcn variables + finance/health chart tokens | Dashboard apps only (PD, JF) |

Foundation tokens live upstream. Dashboard tokens extend them with
semantics that only dashboards need (`--income`, `--expense`,
`--chart-sleep-deep`, `--chart-muscle-chest`, etc.). SH and KO do NOT
need this package — they import only `@vs/shared-tokens`.

## Why extract?

PD and JF had ~270 lines of duplicate shadcn + semantic tokens in each
`globals.css`. Drift already started: PD added new `--chart-*-mood` tokens
in 2026-03 that JF never picked up. Centralizing means:

- One source of truth per token
- Dark-mode parity is guaranteed (no "PD has dark but JF doesn't")
- New dashboards (future apps) import and inherit instantly

## Usage (target state)

In `app/globals.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@vibe-studio/dashboard-tokens/dashboard-tokens.css";

/* project-specific overrides below */
:root {
  --primary: #6366f1; /* your brand accent */
}
```

Tokens are CSS variables; Tailwind consumes them via `@theme inline`
(already declared inside `dashboard-tokens.css`).

## Token groups

| Group | Examples | Notes |
|-------|----------|-------|
| shadcn foundations | `--background`, `--card`, `--primary`, `--ring` | Light + dark |
| Radii | `--radius-sm .. --radius-4xl` | Computed from `--radius` |
| Dashboard semantic | `--income`, `--expense`, `--calories-ok`, `--weight`, `--hr` | Light + dark |
| Chart palettes | `--chart-1 .. --chart-5`, `--chart-income`, `--chart-sleep-deep` | Feature-specific |
| Muscle groups | `--chart-muscle-chest`, `--chart-muscle-legs` | PD gym module |
| UA finance | `--chart-ua-income`, `--chart-ua-esv`, `--chart-ua-vz` | PD Ukraine taxes |
| ES finance | `--chart-es-neto`, `--chart-es-irpf`, `--chart-es-ss` | PD Spain taxes |
| Card surfaces | `--card-bg-start`, `--card-hover-shadow` | Hover/elevation |
| Landing page | `--landing-bg`, `--landing-accent` | Marketing surfaces |

Full list: see comments in `dashboard-tokens.css`.

## Migration plan (for PD and JF)

1. Add `"@vibe-studio/dashboard-tokens": "workspace:*"` to package.json.
2. In `globals.css`, replace the ~270-line shadcn+semantic block with a
   single `@import "@vibe-studio/dashboard-tokens/dashboard-tokens.css"`.
3. Keep project-specific overrides (brand accent, feature-flag tokens)
   below the import.
4. Diff check: `npm run build` should produce identical Tailwind output;
   visual regression via Playwright screenshot diff on `/` and one
   dashboard page.

## Versioning

Any change to a token **value** is considered breaking — apps that
hardcoded a color somewhere will drift. Renames or deletions of tokens
are major version bumps. Adding a new token is a minor bump.

## Non-goals

- Component-level CSS (that is `@vibe-studio/ui`).
- Brand tokens for VS landing / marketing sites (those live in
  `@vs/shared-tokens` or project-local).
- Icon colors beyond the chart palette.
