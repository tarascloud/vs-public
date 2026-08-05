# ADR: @vibe-studio/dashboard-tokens — Shared Package Scaffold

**Date:** 2026-04-19
**Status:** SCAFFOLD (not yet wired)
**Task:** REV-20260419-0014
**Effort:** Scaffold S (<1h). Full migration M (deferred).
**Related:** [shared-css-tokens.md](./shared-css-tokens.md) — review
that motivated this extraction.

## Summary

Create `packages/dashboard-tokens/` inside `vs-private` containing the
~270-line shadcn-foundation + dashboard-semantic CSS token block
currently duplicated between PD (`pd-private/next/src/app/globals.css`)
and JF (`jf-private/next/src/app/globals.css`).

## Relationship to the existing `@vs/shared-tokens` package

There is already `packages/shared-tokens/` in this repo. It contains
**foundation** tokens (bg/text/border/status primitives) intended for
ALL projects (VS landing, PD, JF, SH, KO).

`dashboard-tokens` is a sibling package, **not a replacement**, scoped
to dashboard apps only (PD + JF). It contains:

- shadcn/ui CSS variables (`--background`, `--card`, `--primary`, etc.)
  for light **and** dark themes
- Dashboard semantic tokens (`--income`, `--expense`, `--weight`, `--hr`,
  `--calories-ok`, `--mood`) — meaningless for SH/KO which don't render
  finance/health dashboards
- Chart palettes (`--chart-1..5`, `--chart-sleep-deep`, `--chart-muscle-chest`,
  `--chart-ua-esv`, `--chart-es-irpf`) — PD-specific but duplicated in JF
  because JF's analytics module cribbed from PD
- Card surface tokens (`--card-bg-start`, `--card-hover-shadow`)

SH and KO MUST NOT import this package — they are not dashboards. Their
design language (SH: coaching platform, KO: art gallery) is different
enough that forcing these tokens would bloat bundles and leak
meaningless variables into devtools.

## Why not merge into `@vs/shared-tokens`?

Considered and rejected:

- `shared-tokens` aims to be tiny (currently 150 lines). Merging would
  triple its size with concepts most consumers don't use.
- Dashboard tokens drift more often than foundation tokens (e.g. adding
  a new chart color when we add a new analytics card) — keeping them
  separate means `shared-tokens` version can stay stable at 1.x while
  `dashboard-tokens` churns.
- Dark-mode chart palette tweaks belong at the app-domain layer, not
  the foundation layer.

## What the scaffold delivers

```
packages/dashboard-tokens/
  package.json              # "@vibe-studio/dashboard-tokens" v0.1.0
  dashboard-tokens.css      # 324-line @theme inline + :root + .dark blocks
  README.md                 # usage + migration plan + token glossary
```

The CSS file is extracted verbatim from `pd-private` globals.css lines
5-328 (the @theme inline block + :root + .dark declarations). PD is the
authority because PD has the most complete token set; JF's duplicate
was slightly stale (missing mood tokens and some UA tax colors).

## Migration path (not executed)

Phase 1 — workspace setup (shared with `@vibe-studio/security`):
- pnpm workspace at `/opt/repos/vibe-studio/` root.

Phase 2 — PD migration (1 hour):
- `package.json`: add `"@vibe-studio/dashboard-tokens": "workspace:*"`.
- `globals.css`: replace lines 5-328 with
  `@import "@vibe-studio/dashboard-tokens/dashboard-tokens.css";`.
- `npm run build` — verify Tailwind output identical (diff bundle size
  and computed class list).
- Playwright screenshot diff on `/`, `/finance`, `/health`.

Phase 3 — JF migration (1 hour):
- Same as Phase 2 for JF globals.css.
- **Visual diff expected:** JF will pick up mood tokens + newer UA tax
  colors. Either accept (they were supposed to match PD anyway) or
  override locally in JF globals.css below the import.

Phase 4 — delete duplicate blocks (trivial).

## Why scaffold first

- Full migration requires pnpm workspace setup (shared dependency with
  security + ui packages). Ship all three scaffolds first, then set up
  workspace once.
- Scaffold lets designers review the canonical token set in isolation
  before either consumer adopts.

## Token count in scaffold

```
@theme inline block:  67 lines
:root light block:    143 lines
.dark block:          118 lines
Total file:           324 lines (including leading comment)
```

## Risks

| Risk | Mitigation |
|------|------------|
| JF's slightly-stale palette is "correct" and PD's newer is "wrong" | Visual review with Owner before Phase 3 |
| Dashboard tokens drift away from `@vs/shared-tokens` foundation | Cross-reference in both READMEs; add lint rule in follow-up |
| Consumers inline instead of importing | Same as security package — explicit README warning |

## References

- `docs/adr/shared-css-tokens.md` — full review of per-project globals.css
- `packages/shared-tokens/` — sibling foundation package
- MemPalace: no direct predecessors
