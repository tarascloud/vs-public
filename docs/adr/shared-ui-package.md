# ADR: @vibe-studio/ui — Shared Package Scaffold

**Date:** 2026-04-19
**Status:** SCAFFOLD (not yet wired)
**Task:** REV-20260419-0015
**Effort:** Scaffold S (<1h). Full migration L (deferred, per-project).
**Related:** [shared-ui-components.md](./shared-ui-components.md) —
review that motivated this extraction.

## Summary

Create `packages/ui/` scaffold inside `vs-private` containing the
canonical shadcn/ui components (button, input, card, dialog, select)
duplicated across PD, JF, and SH. Canonical versions are copied from
PD (reference implementation).

## Scope

Included in v0.1.0 scaffold (5 components):

- `button.tsx` — `@base-ui/react/button` + `class-variance-authority` variants
- `input.tsx` — `@base-ui/react/input`
- `card.tsx` — Card / CardHeader / CardTitle / CardDescription /
  CardAction / CardContent / CardFooter
- `dialog.tsx` — `@base-ui/react/dialog` with focus trap, ARIA,
  close button, animation tokens
- `select.tsx` — `@base-ui/react/select` portal + keyboard navigation

Excluded (stay per-project for now):
- `accordion`, `avatar`, `calendar`, `checkbox`, `command`, `popover`,
  `radio-group`, `scroll-area`, `sheet`, `skeleton`, `slider`, `switch`,
  `table`, `tabs`, `textarea`, `tooltip`
- Reason: each has meaningful per-project divergence (calendar i18n,
  command palette scopes, tab styling). Extract in later phases after
  the five core primitives prove the workflow.

Also excluded:
- `badge` — all three projects ship different variants; needs design
  review first.
- `label` — only PD and JF, they diverge, and the component is 8 lines.
  Not worth the coordination cost.

## Why scaffold first, not full migration?

Per the `shared-ui-components.md` review table:
- PD == SH for `dropdown-menu`, `input`, `select`, `separator` — trivial to merge.
- PD ~= SH for `button`, `card`, `dialog` — small diffs (4-27 lines),
  mergeable with visual review.
- JF diverges heavily on almost every component — needs dedicated
  port PR adding JF's custom variants back into the shared package
  **before** JF can migrate.

A scaffold captures the canonical PD implementations as v0.1.0, then
each consumer migrates on its own timeline. JF specifically will need
a variant-preservation pass first.

## Canonical decisions baked in

1. **`@base-ui/react` over `@radix-ui`**: PD migrated from Radix to
   `@base-ui/react` 1.3 in early 2026 for better Next 16 RSC
   compatibility. JF and SH will migrate via this package.

2. **`data-slot` attributes** for every subcomponent: enables styling
   hooks consumers can target (`.card [data-slot=card-header] { ... }`).
   Treated as public API — renaming is a breaking change.

3. **Button `size` variants include 44px touch targets**:
   - `size="lg"` → `h-9` (44px with padding) — mobile-safe.
   - `size="default"` → `h-8` (compact desktop).
   - `size="icon-lg"` → `size-9` — mobile-safe icon button.
   Consumers should use `lg`/`icon-lg` for any primary action on
   mobile-first pages.

4. **Dialog has no tabIndex hack**: `@base-ui/react` handles focus
   management natively. The overlay blocks interaction; `Esc` closes;
   focus traps inside content; returns focus to trigger on close.

5. **`cn()` helper is per-consumer**: scaffold expects `@/lib/utils`
   path alias to provide `cn`. Real migration may export `cn` from this
   package OR keep the injection pattern. Decision deferred to
   migration ADR.

## Migration path (not executed)

Shared Phase 1 — pnpm workspace (batched with security + dashboard-tokens).

Phase 2 — PD migration (3 hours):
- Replace imports: `@/components/ui/{button,input,card,dialog,select}`
  → `@vibe-studio/ui/*`.
- Delete the five corresponding files in
  `pd-private/next/src/components/ui/`.
- Screenshot diff on `/` and one dashboard page.
- If PD uses any extended variants that the shared package doesn't
  expose, contribute them back before deleting.

Phase 3 — SH migration (2 hours): same as PD. Low-risk (components
are already == or ~= PD).

Phase 4 — JF variant port (1 day):
- Identify every JF-specific Button variant, Card surface, Dialog
  transition.
- Add them to the shared package as opt-in variants.
- Version bump to 0.2.0.

Phase 5 — JF migration (3 hours): as PD/SH.

Phase 6 — KO assessment (0.5 day): KO currently uses Radix-style
imports; if we extract a second wave of primitives to the shared
package, KO becomes a candidate. Not in scope for this ticket.

## Risks

| Risk | Mitigation |
|------|------------|
| `@base-ui/react` API breaking change between PD install and consumer install | Pin peerDependency to `>=1.3.0 <2.0.0` in package.json |
| JF variants lost in migration | Explicit Phase 4 dedicated to port |
| `data-slot` used by consumer CSS selectors; accidental rename breaks styling | Treat as public API; enumerate in README; major version bump on change |
| Consumers diverge again by copy-pasting into their local `components/ui/` | Lint rule (follow-up) to forbid new files in `components/ui/` matching package exports |

## What the scaffold delivers

```
packages/ui/
  package.json          # "@vibe-studio/ui" v0.1.0, peerDeps for React 19 + @base-ui
  README.md             # usage, a11y guarantees, migration plan, divergence table
  src/
    button.tsx          # PD reference, header comment documents origin
    input.tsx
    card.tsx
    dialog.tsx
    select.tsx
    index.ts            # barrel
```

Each `.tsx` prepends a provenance header:

```ts
// @vibe-studio/ui — canonical button
// Source: pd-private/next/src/components/ui/button.tsx (PD reference, 2026-04-19)
// See packages/ui/README.md for migration plan.
```

## References

- `docs/adr/shared-ui-components.md` — full component-by-component
  diff table across PD/JF/SH
- `packages/dashboard-tokens/` — sibling package (tokens consumed by
  these components)
- `packages/security/` — sibling scaffold
- MemPalace: feedback_prefer_ready_assets (prefer shadcn primitives)
