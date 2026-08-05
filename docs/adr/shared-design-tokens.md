# ADR: @vibe-studio/design-tokens — Ecosystem Umbrella Tokens

**Date:** 2026-05-07
**Status:** PROPOSED (scaffold shipped, no project consumes yet)
**Task:** DES-20260507-0015
**Initiative:** Shared design language across VS ecosystem
**Effort:** S (scaffold) + 7×M (per-project migration, deferred)
**Related ADRs:**
- `shared-css-tokens.md` (REV-20260419-0014) — dashboard-tokens motivation
- `dashboard-tokens-package.md` (REV-20260419-0014) — `@vibe-studio/dashboard-tokens` scaffold
- `.claude/rules/css-tokens-sync.md` — interim sync rules (deprecated by this ADR after migration)

## Context

The VS ecosystem now spans **7 projects** (VS, PD, JF, SH, KO, BP, Tatiana),
each with its own `globals.css` ranging from 342 (KO) to 1263 (SH) lines.
Audit (2026-05-07):

| Project | `globals.css` | font primary | accent primary | mode      |
|---------|---------------|--------------|----------------|-----------|
| VS app  |  651 lines    | Inter        | indigo-500     | dark only |
| PD      | 1037 lines    | Inter        | blue-600       | dual      |
| JF      |  965 lines    | Geist        | blue-600       | dual      |
| SH      | 1263 lines    | Geist+Playfair | emerald-700  | dual      |
| KO      |  342 lines    | Inter        | **black** ([exception](../../.claude/rules/css-tokens-sync.md#ko---accent-exception-r6-ux-07-2026-04-25)) | dual |
| BP      |  N/A (file missing in audit) | Inter | terracotta | dual |
| Tatiana | N/A (file missing in audit)  | Inter | indigo     | light |

Two prior packages partially address the duplication:

- `@vs/shared-tokens` (v1.0.0, 2026-04-19) — foundation (bg/text/border,
  spacing, radius). 207 lines.
- `@vibe-studio/dashboard-tokens` (v0.1.0, 2026-04-19) — shadcn-flavour
  tokens for PD/JF dashboards.

Neither offers a **single ecosystem-wide vocabulary** that all 7 projects
can share. `@vs/shared-tokens` uses `--bg-base / --text-primary` naming
that doesn't map cleanly to shadcn or to KO's gallery brand. The
interim sync rule (`.claude/rules/css-tokens-sync.md`) requires
manually mirroring changes across 7 files — does not scale.

## Decision

Ship a third, explicitly scoped package: **`@vibe-studio/design-tokens`**.

It provides an **ecosystem vocabulary** (`--vs-core-*`, `--vs-primary`,
`--vs-bg`, `--vs-font-body`, etc.) layered as:

1. **Tier 0 — Core primitives** (`--vs-core-indigo-500`): never used directly.
2. **Tier 1 — Semantic roles** (`--vs-primary`, `--vs-bg`, `--vs-text`):
   the only tokens components reference.
3. **Tier 2 — Brand skins** (`[data-brand="ko"] { ... }`): each app loads
   exactly one and re-binds Tier 1 roles.

The two existing packages remain. They are **not deprecated** by this
ADR — they cover concerns this package intentionally does not (shadcn
naming compat, dashboard semantics).

### Why a third package, not a merge?

- `@vs/shared-tokens` ships as v1.0.0 already. Renaming variables or
  changing semantics would force a major version + flag-day migration
  in every consumer at once.
- `@vibe-studio/dashboard-tokens` is *intentionally* dashboard-only —
  its 324 lines of shadcn vars don't belong in KO/BP/Tatiana bundles.
- Layering a thin umbrella on top means each project can pick which
  layers apply (foundation? dashboard? shadcn shapes?) instead of
  inheriting everything.

### Brand alignment decisions made in this scaffold

The originating ticket asked Designer (Дізі) to make 3 ambiguous decisions
autonomously. Decisions taken:

#### Decision 1 — Spectrum (master accent)

**Decision:** Each brand keeps its current accent. VS indigo is master
**only for VS itself, PD (when re-aligning), and Tatiana**. KO stays
monochrome (gallery identity, see KO `--accent` exception). SH/JF/BP
keep individual accents.

**Rationale:** Brand identity is non-negotiable for KO (gallery brand
needs neutral chrome to let artwork lead) and SH (emerald = trust
signal for coaching). Forcing indigo across all 7 would hurt brand
recognition without measurable UX win. Shared neutrals (bg/text/card/
border) provide the **system feel**; per-brand accents preserve the
**brand feel**.

#### Decision 2 — Typography

**Decision:** Default `--vs-font-body = Inter`. Two explicit allowed
display variants:
- `--vs-font-display = Inter` (default — most projects)
- `--vs-font-display = Playfair` (SH, KO, Tatiana — editorial/gallery feel)
- JF gets `--vs-font-body = Geist` retained (developer aesthetic, intentional).

**Rationale:** Inter is the de-facto consensus across PD, VS, KO body, BP,
Tatiana body. Playfair already adopted in SH headings + KO emblems +
Tatiana — keep where it serves brand. JF Geist is a deliberate developer
signal that Owner explicitly retained per ticket.

#### Decision 3 — Spacing & radius

**Decision:** Adopt the existing `@vs/shared-tokens` spacing (4-px grid:
0/1/2/3/4/5/6/8/10/12/16) and radius scale (xs/sm/md/lg/xl/2xl/full)
verbatim, re-namespaced as `--vs-space-*` / `--vs-radius-*`. Add semantic
step aliases (`--vs-step-1` → `--vs-space-1` etc.) for component-level
clarity.

**Rationale:** Both scales are already validated by the design system
review (REV-20260419-0013, REV-20260419-0019). Re-deriving them would
fragment further.

### Open questions (deferred)

- **Card hover shadow brand-tinting** — PD has indigo-tinted shadows, JF
  has neutral shadows. Should these become a Tier 2 brand override?
  Deferred until per-project migration phase.
- **Chart palettes** — currently in `@vibe-studio/dashboard-tokens`. Should
  they migrate to the umbrella as `--vs-chart-*`? Deferred until SH
  starts charting.
- **Dark-mode-by-default flag** — VS is dark-only; should
  `data-brand="vs"` auto-imply `class="dark"`? Currently requires both.
  Considered too magical, may revisit.

## Consequences

### Positive

- Single ecosystem vocabulary for all 7 projects.
- Adding a new project = `@import "@vibe-studio/design-tokens"` + one
  brand file. Zero copy-paste of foundation values.
- Brand evolution becomes a one-file change (e.g. KO repaint = edit
  `tokens/brands/ko.css` only).
- `.claude/rules/css-tokens-sync.md` becomes obsolete after migration —
  one less manual sync surface.
- Cohabits with existing packages without breaking changes.

### Negative

- A third tokens package is briefly confusing. Mitigated by clear scope
  in each README and a top-level decision matrix table (this ADR).
- Per-project migration is non-trivial (~M each). Tracked as 7 follow-up
  tickets, not part of this scaffold.
- Two naming conventions cohabit during transition (`--bg-base` from
  shared-tokens, `--vs-bg` from design-tokens). Resolved at end of
  migration phase by deprecating shared-tokens v1.

### Migration plan (per project, future tickets)

| Step | Project | Reason for order                                          |
|------|---------|-----------------------------------------------------------|
| 1    | PD      | Canon source, largest token surface — exposes gaps early  |
| 2    | VS      | Dark-only, smallest brand override surface, biggest payoff (already drift-prone) |
| 3    | JF      | Mirrors PD structure, low risk after PD passes            |
| 4    | SH      | Warm palette is non-trivial; do after dashboards stabilize |
| 5    | KO      | Must preserve `--accent` exception, careful review        |
| 6    | BP      | Standalone, low risk                                       |
| 7    | Tatiana | Smallest surface, finishes the ecosystem                   |

Each migration ticket will:
1. Add `@vibe-studio/design-tokens` to `package.json`.
2. Insert imports at the top of `globals.css`.
3. Tag `<html data-brand="..." />` in root layout.
4. Playwright screenshot diff before/after — no visual change expected.
5. Gradually migrate components from project-local vars to `--vs-*`.

### Verification (this scaffold)

- [x] Package files exist: `packages/design-tokens/{package.json,index.css,README.md,tokens/}`.
- [x] CSS imports resolve in declared order (core → semantic → light → dark).
- [x] All 7 brand skins exist and only override Tier 1 roles.
- [x] No project's `globals.css` is modified by this scaffold (zero visual diff).

This ADR is `verificationStatus: NO_RUNTIME` — the scaffold introduces no
runtime behavior to verify until a project consumes it.

## Decisions summary table (for quick reference)

| # | Question                              | Decision                                |
|---|---------------------------------------|-----------------------------------------|
| 1 | Master accent across ecosystem?       | No. Brands keep individual accents; only neutrals are shared. |
| 2 | Default font body?                    | Inter. Display = Inter or Playfair per brand. JF retains Geist. |
| 3 | Spacing scale?                        | 4-px grid from shared-tokens (canonical). |
| 4 | Radius scale?                         | xs/sm/md/lg/xl/2xl/full from shared-tokens. |
| 5 | Naming convention?                    | `--vs-core-*` (Tier 0), `--vs-<role>` (Tier 1), brand re-binds Tier 1. |
| 6 | Light vs dark default?                | Light default; `.dark` opt-in. VS brand forces dark. |
| 7 | Dashboard-tokens fate?                | Keep. Layered on top of design-tokens, not replaced. |
| 8 | shared-tokens v1 fate?                | Keep until end of migration phase. Then deprecate v1, ship v2 as alias to design-tokens. |
| 9 | Force migrate now?                    | No. Scaffold only. Per-project migration tickets follow. |

## Links

- Package: `packages/design-tokens/`
- Companion package (kept): `packages/shared-tokens/`
- Companion package (kept): `packages/dashboard-tokens/`
- Interim sync rule (deprecated by this ADR after migration): `.claude/rules/css-tokens-sync.md`
- Originating ticket: DES-20260507-0015
