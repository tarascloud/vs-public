# ADR: @vibe-studio/dashboard-tokens — Shared CSS Design Tokens

**Date:** 2026-04-19
**Status:** PROPOSED
**Task:** REV-20260419-0014
**Effort:** XL (cross-repo extraction)

## Context

PD (`pd-private/next/src/app/globals.css`, 1037 lines) and JF (`jf-private/src/app/globals.css`, 965 lines) share nearly identical CSS files. SH (`sh-private/src/app/globals.css`, 1244 lines) has a similar but more extended version.

### Quantitative analysis (PD vs JF)

| Metric | Value |
|--------|-------|
| Total `:root` CSS variables (PD) | 128 |
| Total `:root` CSS variables (JF) | 106 |
| **Identical** (same name + same value) | 105 |
| PD-only variables | 23 (all `--landing-*` + branded `--card-hover-shadow`) |
| JF-only variables | 1 (generic `--card-hover-shadow`) |
| Total diff lines | 183 |
| Shared theme skins | 4 (Light, Dark, Aurora, Owner, Neon) — all present in both |

### What is shared (canon)

1. **@theme inline block** — 46 Tailwind CSS 4 color/radius mappings (identical)
2. **:root variables** — 105 of 128 CSS custom properties: `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--card`, `--border`, `--input`, `--ring`, `--chart-*`, `--income`, `--expense`, `--sidebar-*`, `--skeleton-*`
3. **Theme skins** — `.dark`, `.dark[data-skin="aurora"]`, `[data-skin="owner"]` with 100+ variables each
4. **@layer base** — body/heading typography, scrollbar-hide, scroll-fade, mobile optimizations
5. **Animations** — `fadeIn`, `fadeInUp`, `animate-page-in`
6. **Utilities** — `.metric-card`, `.stagger-*` delay classes

### What is project-specific

| Project | Unique tokens/sections |
|---------|----------------------|
| **PD** | `--landing-*` (23 vars), branded `--card-hover-shadow` with blue/violet tints, skeleton-shimmer keyframes, `.card-hover-fx`, 12 stagger classes, letter-spacing on headings, `.metric-card::after` overlay |
| **JF** | Generic `--card-hover-shadow`, `@keyframes breathe` (vacancy indicator), `@keyframes shimmer`, 6 stagger classes, focus ring styles |
| **SH** | Extended session/participant-specific tokens, transcript styling |

### Divergence risk

Font stacks differ: PD uses `--font-inter`, JF uses `--font-geist-sans` / `--font-geist-mono`. This is a legitimate per-project choice that must remain overridable.

## Decision

Extract shared CSS tokens into `@vibe-studio/dashboard-tokens` as a publishable Tailwind CSS 4 preset/plugin.

### Package structure

```
packages/dashboard-tokens/
  package.json          # @vibe-studio/dashboard-tokens
  src/
    base.css            # @theme inline + shared :root vars + @layer base
    skins/
      dark.css          # .dark theme
      aurora.css        # aurora skin (light + dark)
      owner.css         # owner skin
      neon.css          # neon skin
    animations.css      # fadeIn, fadeInUp, animate-page-in
    utilities.css       # scrollbar-hide, scroll-fade, metric-card, stagger-*
  index.css             # @import all
```

### Consumer usage

```css
/* globals.css (PD) */
@import "tailwindcss";
@import "@vibe-studio/dashboard-tokens";

/* PD-specific overrides */
:root {
  --font-sans: var(--font-inter);
  --card-hover-shadow: 0 8px 24px rgba(37, 99, 235, 0.06), ...;
  --landing-bg: #26282b;
  /* ... other PD-only vars */
}
```

### Migration plan

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Create `packages/dashboard-tokens/` in monorepo root with extracted CSS | M |
| 2 | Replace PD `globals.css` with import + overrides, verify all skins | M |
| 3 | Replace JF `globals.css` with import + overrides | S |
| 4 | Replace SH `globals.css` with import + overrides | S |
| 5 | Add visual regression tests (Playwright screenshot comparison) | M |
| 6 | Publish to private npm registry or use workspace protocol | S |

### Risks

- **Visual regression** — different shadow values, animation timings may cause subtle UI differences. Mitigate with before/after Playwright screenshots.
- **Font stack** — must remain overridable per project. Package provides a sensible default, projects override `--font-sans`.
- **Skin divergence** — projects may need to add project-specific skins. Package exports base skins, projects can extend.

## Alternatives considered

1. **git submodule** — rejected: adds git complexity, poor DX
2. **Copy-paste with lint rule** — current approach, proven to drift
3. **Tailwind preset (JS)** — possible but CSS-native is simpler for token-only sharing

## Consequences

- Single source of truth for ~105 CSS variables and 4 theme skins
- Projects keep full control over overrides and project-specific tokens
- Breaking changes in tokens surface as import errors, not silent drift
