# Design System

Figma Design System specification for the example.com ecosystem (VS, PD, JF, SH, Website).

## Files

| File | Description |
|------|-------------|
| `figma-spec.md` | Full specification for building the Figma Design System file |

## Source of Truth

| Asset | Location |
|-------|----------|
| Shared tokens (CSS) | `packages/shared-tokens/tokens.css` |
| Brand guidelines | `docs/brand-guidelines.md` |
| Component audit | `docs/design-audit/component-audit.md` |
| Dark mode audit | `docs/design-audit/dark-mode-unification.md` |
| VS logo (original) | `app/public/vs-logo/vs1.svg` |
| Project globals.css | Each project's `src/app/globals.css` |

## How to Use figma-spec.md

1. **Create a new Figma file** named "example.com Design System".
2. **Create 5 pages** as described in the spec: Foundations, Components, Patterns, Templates, Brand.
3. **Set up Variables** first (Page 1) -- colors, spacing, radius as Figma Variable Collections. Use modes for Light/Dark.
4. **Build components** (Page 2) using Auto Layout and the variable references. Create component sets with all variant/state combinations.
5. **Compose patterns** (Page 3) from the components.
6. **Build templates** (Page 4) from patterns and components.
7. **Add brand assets** (Page 5) -- logo files, project cards, OG templates.
8. **Publish as a Library** so all project files can reference shared components.

## Component Baseline

The recommended baseline for shared components is the **PD shadcn v4 pattern** (using @base-ui + CVA). When building Figma components, match the PD implementation for API consistency across projects.

## Per-Project Customization

Each project applies its own accent colors and brand identity on top of the shared foundation:

- **VS** -- Indigo/Violet, dark-only, custom CSS (no shadcn)
- **PD** -- Blue, light+dark+skins, shadcn v4
- **JF** -- Blue, light+dark+skins, shadcn classic (migrating to v4)
- **SH** -- Emerald/Gold, warm palette, Playfair headings, minimal custom components
- **Website** -- Gold, Apple-inspired minimalism
