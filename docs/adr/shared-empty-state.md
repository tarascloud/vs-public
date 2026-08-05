# ADR: EmptyState — canon source, mirrors, and intentional divergence

**Date:** 2026-05-13
**Status:** ACCEPTED (documents existing state)
**Ticket:** DEV-20260512-0014
**Related:** `shared-ui-components.md`, `shared-landing-ui.md`, `shared-css-tokens.md`,
`../../.claude/rules/css-tokens-sync.md`

## Context

`EmptyState` exists in 6 codepaths:

| Project | Path | Shape |
|---------|------|-------|
| PD | `pd-private/next/src/components/shared/empty-state.tsx` | **canon copy** (130 lines, fully commented) |
| JF | `jf-private/src/components/EmptyState.tsx` | **canon copy** (68 lines, no compact prop in some snapshots — see "Drift watch") |
| KO | `korobkovart/site/src/components/EmptyState.tsx` | **canon copy** (116 lines) |
| SH | `sh-private/src/components/empty-state.tsx` | **canon copy** (115 lines) |
| VS | `app/src/components/ui/empty-state.tsx` | **bespoke** (24 lines) — see below |
| BP | `bp-private/src/components/dashboard/EmptyState.tsx` | **bespoke brand** (38 lines) — see below |

The first 4 (PD/JF/KO/SH) share the canon shape documented in
`.claude/rules/css-tokens-sync.md` §"Shared components (R6 UX-05, 2026-04-25)".
The last 2 (VS, BP) intentionally diverge.

The 7th occurrence in `jf-public/src/components/EmptyState.tsx` is a copy of
JF's canon copy, kept in sync by `jf-private/scripts/sync-to-public.sh`.

## Canon API

```ts
type IconProp = ElementType | ReactNode;
type ActionProp =
  | { label: string; href?: string; onClick?: () => void }
  | ReactNode;

interface EmptyStateProps {
  icon?: IconProp;
  title: string;
  description?: string;
  action?: ActionProp;
  compact?: boolean;       // py-6 vs py-16
  className?: string;
  children?: ReactNode;
}
```

- `bg-muted`, `text-muted-foreground`, `text-foreground` semantic tokens only — no
  hardcoded colors. Each consumer rebrand via `.theme-<x>` skin tokens.
- Uses `Button` from `@/components/ui/button` and `Link` from `next/link`.
- Icon variant detection: ReactElement → render as-is wrapped in muted circle;
  ElementType → instantiate with `h-8 w-8 text-muted-foreground`.

## Canon source — PD

Origin: JF (canonical commit message UX-05 2026-04-25). After the API was
extended to support `ReactNode` icons and CTA, PD's copy was promoted to the
**canon source of truth** because it carries the most complete header
documentation. JF/KO/SH copies are byte-equivalent modulo the header comment.

**When updating the canon API**, edit PD first, then propagate the change to
JF, KO, SH. Run the diff verification command below.

## Verification (drift watch)

```bash
# Strip header comments, compare body
strip() { sed -n '/^export function EmptyState/,$p' "$1"; }

diff <(strip pd-private/next/src/components/shared/empty-state.tsx) \
     <(strip jf-private/src/components/EmptyState.tsx)
diff <(strip pd-private/next/src/components/shared/empty-state.tsx) \
     <(strip korobkovart/site/src/components/EmptyState.tsx)
diff <(strip pd-private/next/src/components/shared/empty-state.tsx) \
     <(strip sh-private/src/components/empty-state.tsx)
```

Expected: no output (identical bodies).

Note (2026-05-13 audit): JF's current `src/components/EmptyState.tsx` is missing
the `compact` prop and the ReactNode-icon branch (it's an older snapshot of the
canon, pre-UX-05 extension). This is **drift**, not divergence. Tracked as
follow-up DEV-20260512-0014-FOLLOWUP — JF should be re-synced to PD canon.

## Intentional divergence

### VS — `app/src/components/ui/empty-state.tsx`

VS is the Vibe Studio internal app. Its EmptyState is:
- Used in studio/kanban/admin tooling, not in user-facing brand surfaces.
- 24 lines, accepts only `LucideIcon` (not ReactNode) and `action` as ReactNode.
- Sized at `py-12` (vs canon `py-16` / `py-6 compact`).
- Bound to the same semantic tokens (`text-muted-foreground`) so theme skins
  still work.

**Decision: keep bespoke.** Rationale:
- VS UI surface is operator-facing, not consumer-facing — visual coherence with
  PD/JF/KO is not a requirement.
- Migration cost would touch ~6 call-sites for a delta no operator will notice.
- If VS surfaces ever expose user-facing flows, revisit and switch to canon.

### BP — `bp-private/src/components/dashboard/EmptyState.tsx`

BP (Bilchaka Prodavaka) is a brand-identity-heavy product. Its EmptyState uses:
- A `SquirrelLottie` decorative animation (mascot).
- Brand-specific colour tokens (`--color-bark-700`, `--color-acorn-400`)
  instead of the shadcn semantic ones.
- Custom CTA button geometry (`rounded-[14px]`, hover translate-y).

**Decision: keep bespoke.** Rationale:
- BP is a one-off brand with its own design system (mascot-led, acorn/bark
  palette). Stripping the mascot to share canon would erase brand identity.
- Per the KO `--accent` precedent in `css-tokens-sync.md`: brand-identity sites
  may diverge from the SaaS-dashboard canon when the divergence is the brand.
- BP has no plan to consolidate into `@vibe-studio/ui` because BP would be
  the one project that imports the package and then immediately re-wraps it.

## Future: `@vibe-studio/ui` migration

Long-term plan (per `shared-ui-components.md`, `shared-landing-ui.md`): extract
`EmptyState` into `packages/ui/src/empty-state.tsx`. **Blocker:**
no consumer project currently has `@vibe-studio/ui` in `package.json`
dependencies. The workspace setup is shared across all open ADRs and is
tracked in `shared-landing-ui.md`.

When that blocker resolves, the migration is:

1. Copy PD canon to `packages/ui/src/empty-state.tsx`, export from
   `packages/ui/src/index.ts`.
2. Bump `@vibe-studio/ui` minor version.
3. In each of PD/JF/KO/SH:
   - Replace local `EmptyState` body with re-export:
     `export { EmptyState } from "@vibe-studio/ui";`
   - Keep the local file path so call-sites don't need to change.
4. Remove the canon-mirror clause from `css-tokens-sync.md` (no longer needed).
5. Update `jf-private/scripts/sync-to-public.sh` to handle the new import.
6. VS and BP: leave bespoke; explicitly document in their CLAUDE.md that they
   opt out of the shared package.

## Alternatives considered

- **Move to `packages/ui/src/empty-state.tsx` now** — rejected.
  No consumer can import it yet (workspace blocker per `shared-landing-ui.md`).
  Would add a 5th unused copy and create the impression of canonical migration
  having happened when it hasn't.
- **Document that every project has its own EmptyState by design** — rejected.
  PD/JF/KO/SH have **the same** EmptyState; calling that intentional divergence
  is wrong. Only VS and BP are intentionally divergent.
- **Delete the bespoke VS/BP copies and force them onto canon** — rejected.
  VS is operator-facing and BP is brand-led; both have stated divergence
  rationale that outweighs the consolidation win.

## Consequences

**Positive**
- Canon source is unambiguously PD; mirror list is closed (4 projects).
- VS and BP divergence is documented and justified, not silent.
- Drift detection has a verification command.
- Migration path to `@vibe-studio/ui` is spelled out and depends only on
  the existing workspace blocker.

**Negative**
- Until the workspace blocker resolves, 4 copies of the same file remain.
  Any canon API change requires 4 manual edits + diff verification.
- JF drift exists at the time of writing — follow-up task created.

## Cross-refs

- [shared-ui-components.md](./shared-ui-components.md) — broader shadcn extraction plan
- [shared-landing-ui.md](./shared-landing-ui.md) — landing primitives + workspace blocker
- [shared-css-tokens.md](./shared-css-tokens.md) — token-level canon decisions
- [css-tokens-sync.md](../../.claude/rules/css-tokens-sync.md) — operational sync rules
