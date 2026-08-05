# CSS Tokens Sync Rules

Until `@vibe-studio/dashboard-tokens` is extracted (ADR: `docs/adr/shared-css-tokens.md`),
these rules prevent further divergence.

## Canonical package: `@vibe-studio/design-tokens` (DES-20260610-0001)

`packages/design-tokens/tokens.css` is the **single-file canonical
sheet** (shadcn naming, PD-canon values, unified `--status-*` scheme — accents
from JF + bg/fg pairs from KO; rationale in the package README). Projects are
separate git repos, so consumption is **copy-sync** for now (same model as
`@vibe-studio/security`). Drift report (no auto-fix):

```bash
bash scripts/design-tokens-sync.sh
```

When changing a shared token value: update `tokens.css` FIRST, then the
projects that adopted it, then re-run the checker. Per-project migration onto
the canon is tracked in separate tasks — do not migrate ad-hoc.

## Canon source

**PD** (`pd-private/next/src/app/globals.css`) is the canon source for shared CSS tokens
(and the value source for `tokens.css` above).

## When adding/changing CSS variables

1. If the variable exists in both PD and JF globals.css — change BOTH files
2. If adding a new shared variable (not project-specific) — add to BOTH
3. Project-specific variables (e.g., PD's `--landing-*`, JF's `@keyframes breathe`) stay only in their project
4. Theme skins (Dark, Aurora, Owner, Neon) MUST stay in sync — they are shared UX

## How to verify sync

```bash
# Extract and compare :root vars
diff <(sed -n '/^:root {/,/^}/p' pd-private/next/src/app/globals.css | grep -P '\-\-[\w-]+:' | sort) \
     <(sed -n '/^:root {/,/^}/p' jf-private/src/app/globals.css | grep -P '\-\-[\w-]+:' | sort)
```

Expected: only `--landing-*` (PD) and `--card-hover-shadow` value differences.

## KO `--accent` exception (R6 UX-07, 2026-04-25)

KO (`korobkovart/site/src/app/globals.css`) intentionally diverges from the
PD canon: `--accent: #000000` is used as a high-contrast button background
instead of the shadcn/ui semantic ("subtle hover surface").

Rationale: KO is a gallery-brand site, not a SaaS dashboard, and the
high-contrast button look is part of the brand identity. Renaming would
touch ~12 callsites and any future shadcn upgrade for negligible UX win.

**Do not** copy KO's `--accent` value back into the PD canon. **Do not**
copy a shadcn component into KO without re-binding it from `--accent` to
the local `--button-primary` semantic — otherwise it will inherit the
button-style background as a hover layer.

## Shared components (R6 UX-05, 2026-04-25)

| Component | Canon source | Mirrored in |
|---|---|---|
| `EmptyState` | `jf-private/src/components/EmptyState.tsx` | PD (`pd-private/next/src/components/shared/empty-state.tsx`), KO (`korobkovart/site/src/components/EmptyState.tsx`), SH (`sh-private/src/components/empty-state.tsx`) |

Canon API (backward-compatible superset):

```ts
type EmptyStateProps = {
  icon?: ElementType | ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void } | ReactNode;
  compact?: boolean;
  children?: ReactNode;
};
```

When updating canon (JF), apply the same change to all mirrored copies.
Future extract path: `@vibe-studio/ui` package.
